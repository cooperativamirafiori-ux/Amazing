#!/usr/bin/env node
/**
 * Ricollega le ricevute importate dalla vecchia app al PDF su SharePoint.
 *
 * Il CSV della vecchia app aveva nella colonna `pdf_drive_url` **solo il nome
 * del file** ("RIC-2026-AMZ-0008.pdf"), non un indirizzo. L'import l'ha copiato
 * cosi' com'e' in `PdfUrl`, e l'area admin lo usava come href: il browser lo
 * leggeva come percorso relativo e apriva un 404.
 *
 * I PDF originali pero' ci sono gia', nella stessa cartella dove archivia l'app
 * nuova:
 *   /sites/Segreteria / Documenti condivisi / General / DONAZIONI /
 *     RICEVUTE PER DONAZIONI / <anno> / Inviate / AMZ
 *
 * Questo script indicizza quella cartella (per anno) e riscrive `PdfUrl` con
 * l'indirizzo vero del file gia' presente. Non crea, non rigenera e non
 * sovrascrive nessun PDF: tocca solo il campo PdfUrl della lista Prenotazioni.
 *
 * Uso (dalla cartella web/):
 *   node scripts/ripara-pdfurl.mjs              # anteprima, non scrive nulla
 *   node scripts/ripara-pdfurl.mjs --applica    # scrive i PdfUrl
 *   node scripts/ripara-pdfurl.mjs --applica --svuota-mancanti
 *        # per le ricevute il cui PDF non si trova, azzera PdfUrl (il numero
 *        # resta scritto in admin, senza link)
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 *   SHAREPOINT_SITE_ID, SP_LIST_PRENOTAZIONI
 * Permesso Graph: Sites.ReadWrite.All (Application), gia' in uso.
 *
 * Idempotente: le prenotazioni che hanno gia' un PdfUrl http vengono saltate.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLICA = process.argv.includes('--applica')
const SVUOTA = process.argv.includes('--svuota-mancanti')

const SITO_RICEVUTE = 'coopmirafiorionlus.sharepoint.com:/sites/Segreteria'
const CARTELLA = 'General/DONAZIONI/RICEVUTE PER DONAZIONI/{anno}/Inviate/AMZ'

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {}
}

async function getToken() {
  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env
  const res = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: GRAPH_CLIENT_ID,
      client_secret: GRAPH_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
    }),
  })
  if (!res.ok) throw new Error(`Token error ${res.status}: ${await res.text()}`)
  return (await res.json()).access_token
}

async function graph(token, method, path, body) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : {}
}

const encodePath = (p) => p.split('/').filter(Boolean).map(encodeURIComponent).join('/')
const annoDi = (numero, data) => {
  const m = String(numero || '').match(/^RIC-(\d{4})-/)
  if (m) return Number(m[1])
  const d = new Date(data)
  return isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear()
}

/** Tutte le prenotazioni della lista, con i campi che servono. */
async function leggiPrenotazioni(token, site, lista) {
  const out = []
  let url =
    `/sites/${site}/lists/${lista}/items?$top=500` +
    `&$expand=fields($select=NumeroRicevuta,Nome,Cognome,Data,PdfUrl)`
  while (url) {
    const page = await graph(token, 'GET', url)
    out.push(...page.value)
    const next = page['@odata.nextLink']
    url = next ? next.replace('https://graph.microsoft.com/v1.0', '') : null
  }
  return out
}

/** Indice nomefile → webUrl della cartella AMZ di un anno. */
async function indicizzaAnno(token, driveId, anno) {
  const cartella = CARTELLA.replace('{anno}', String(anno))
  const perNome = new Map()
  let url = `/drives/${driveId}/root:/${encodePath(cartella)}:/children?$top=500&$select=name,webUrl`
  while (url) {
    let page
    try {
      page = await graph(token, 'GET', url)
    } catch (e) {
      if (String(e.message).includes('→ 404')) {
        console.log(`  ⚠ cartella ${anno} non trovata: ${cartella}`)
        return perNome
      }
      throw e
    }
    for (const f of page.value) perNome.set(f.name.toLowerCase(), f.webUrl)
    const next = page['@odata.nextLink']
    url = next ? next.replace('https://graph.microsoft.com/v1.0', '') : null
  }
  return perNome
}

async function main() {
  loadEnvLocal()
  const site = process.env.SHAREPOINT_SITE_ID
  const lista = process.env.SP_LIST_PRENOTAZIONI
  if (!site || !lista) throw new Error('SHAREPOINT_SITE_ID / SP_LIST_PRENOTAZIONI mancanti')

  const token = await getToken()
  const sitoRic = await graph(token, 'GET', `/sites/${SITO_RICEVUTE}`)
  const drive = await graph(token, 'GET', `/sites/${sitoRic.id}/drive`)
  console.log(`Archivio ricevute: ${sitoRic.webUrl} → libreria "${drive.name}"`)

  const items = await leggiPrenotazioni(token, site, lista)
  const daRiparare = items.filter((i) => {
    const u = String(i.fields?.PdfUrl ?? '').trim()
    return u && !/^https?:\/\//i.test(u)
  })
  console.log(`Prenotazioni totali: ${items.length} — con PdfUrl da riparare: ${daRiparare.length}`)
  if (!daRiparare.length) return

  const indici = new Map()
  for (const anno of new Set(daRiparare.map((i) => annoDi(i.fields.NumeroRicevuta, i.fields.Data)))) {
    const idx = await indicizzaAnno(token, drive.id, anno)
    console.log(`  indice ${anno}: ${idx.size} file`)
    indici.set(anno, idx)
  }

  let riparate = 0, mancanti = 0, svuotate = 0, errori = 0
  for (const it of daRiparare) {
    const f = it.fields
    const anno = annoDi(f.NumeroRicevuta, f.Data)
    const idx = indici.get(anno) || new Map()
    const nominativo = `${f.Nome ?? ''} ${f.Cognome ?? ''}`.trim().replace(/\s+/g, '_')
    const candidati = [
      String(f.PdfUrl).trim(),
      `${f.NumeroRicevuta}.pdf`,
      `Ricevuta_${f.NumeroRicevuta}.pdf`,
      nominativo ? `Ricevuta_${f.NumeroRicevuta}_${nominativo}.pdf` : null,
    ].filter(Boolean)

    let webUrl = null
    for (const c of candidati) {
      const hit = idx.get(c.toLowerCase())
      if (hit) { webUrl = hit; break }
    }
    // Ultima spiaggia: un file qualsiasi che contenga il numero ricevuta.
    if (!webUrl && f.NumeroRicevuta) {
      const num = String(f.NumeroRicevuta).toLowerCase()
      for (const [nome, u] of idx) if (nome.includes(num)) { webUrl = u; break }
    }

    if (!webUrl) {
      mancanti++
      console.log(`  ✗ ${f.NumeroRicevuta}: nessun PDF in archivio (cercato "${f.PdfUrl}")`)
      if (APPLICA && SVUOTA) {
        try {
          await graph(token, 'PATCH', `/sites/${site}/lists/${lista}/items/${it.id}/fields`, { PdfUrl: '' })
          svuotate++
        } catch (e) { errori++; console.log(`    ! ${e.message}`) }
      }
      continue
    }

    if (!APPLICA) {
      console.log(`  → ${f.NumeroRicevuta}: ${webUrl}`)
      riparate++
      continue
    }
    try {
      await graph(token, 'PATCH', `/sites/${site}/lists/${lista}/items/${it.id}/fields`, { PdfUrl: webUrl })
      riparate++
    } catch (e) { errori++; console.log(`  ! ${f.NumeroRicevuta}: ${e.message}`) }
  }

  console.log(
    `\n${APPLICA ? 'Fatto' : 'ANTEPRIMA (nessuna modifica scritta)'}: ` +
      `${riparate} ricollegate, ${mancanti} senza PDF${SVUOTA ? ` (${svuotate} svuotate)` : ''}, ${errori} errori`
  )
  if (!APPLICA) console.log('Per scrivere davvero: node scripts/ripara-pdfurl.mjs --applica')
}

main().catch((e) => { console.error(e.message); process.exit(1) })
