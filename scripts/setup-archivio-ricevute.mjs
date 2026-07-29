#!/usr/bin/env node
/**
 * Setup dell'archiviazione ricevute su SharePoint.
 *
 * Verifica il percorso di destinazione delle ricevute
 *
 *   /sites/Segreteria / Documenti condivisi / General / DONAZIONI /
 *     RICEVUTE PER DONAZIONI / <anno> / Inviate / AMZ
 *
 * diagnostica i permessi dell'app, crea su richiesta le cartelle mancanti e
 * stampa i comandi `npx vercel env add` pronti da incollare in terminale.
 *
 * Uso (dalla cartella web/):
 *   node scripts/setup-archivio-ricevute.mjs                  # verifica
 *   node scripts/setup-archivio-ricevute.mjs --crea           # crea le cartelle mancanti
 *   node scripts/setup-archivio-ricevute.mjs --sito Segreteria  # altro sito nello stesso tenant
 *   node scripts/setup-archivio-ricevute.mjs --test           # carica un PDF di prova
 *
 * Richiede in .env.local (o nell'ambiente):
 *   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET
 *
 * Permesso Graph necessario: Sites.ReadWrite.All (Application) — lo stesso già
 * usato per le liste.
 *
 * Sola lettura salvo --crea / --test. Idempotente.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SITO_DEFAULT = 'coopmirafiorionlus.sharepoint.com:/sites/Segreteria'
const CARTELLA_TEMPLATE = 'General/DONAZIONI/RICEVUTE PER DONAZIONI/{anno}/Inviate/AMZ'

const argv = process.argv.slice(2)
const CREA = argv.includes('--crea')
const TEST = argv.includes('--test')
const SITO_ARG = (() => {
  const i = argv.indexOf('--sito')
  return i >= 0 ? argv[i + 1] : null
})()

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const key = m[1]
      const val = m[2].replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  } catch {
    // .env.local assente: si presume env già impostate
  }
}

async function getToken() {
  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env
  const res = await fetch(
    `https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: GRAPH_CLIENT_ID,
        client_secret: GRAPH_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
      }),
    },
  )
  if (!res.ok) throw new Error(`Token error ${res.status}: ${await res.text()}`)
  return (await res.json()).access_token
}

/**
 * Legge i ruoli applicativi dal token (claim `roles`) senza verificarne la
 * firma: serve solo a dire all'operatore se l'app ha davvero i permessi per
 * scrivere su un sito diverso da quello delle liste.
 *
 * - Sites.ReadWrite.All / Sites.FullControl.All → accesso a TUTTI i siti del
 *   tenant, nessuna autorizzazione per singolo sito da concedere.
 * - Sites.Selected → accesso solo ai siti autorizzati uno per uno.
 */
function diagnosiPermessi(token) {
  let roles = []
  let tenant = ''
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    roles = payload.roles ?? []
    tenant = payload.tid ?? ''
  } catch {
    console.log('  ! Non riesco a leggere i permessi dal token (procedo comunque)')
    return
  }

  console.log(`  Tenant   : ${tenant}`)
  console.log(`  Permessi : ${roles.length ? roles.join(', ') : '(nessun ruolo applicativo!)'}`)

  const pieni = roles.filter((r) => /^Sites\.(ReadWrite|FullControl|Manage)\.All$/.test(r))
  if (pieni.length) {
    console.log(`  ✓ ${pieni[0]} vale su tutti i siti del tenant: nessun accesso da concedere.`)
  } else if (roles.includes('Sites.Selected')) {
    console.log('  ! Solo Sites.Selected: l\'accesso va concesso sito per sito.')
    console.log('    Chiedi all\'amministratore M365 di autorizzare questa app sul sito')
    console.log('    della Segreteria con permesso "write", oppure via Graph:')
    console.log('    POST /sites/{site-id}/permissions con roles: ["write"]')
  } else {
    console.log('  ! Nessun permesso Sites.* trovato: verifica API permissions + admin consent')
    console.log('    in Azure → App registration → API permissions.')
  }
}

async function graph(token, method, path, body, contentType) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': contentType || 'application/json' } : {}),
    },
    body: body ? (contentType ? body : JSON.stringify(body)) : undefined,
  })
  const text = await res.text()
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status}: ${text}`)
    err.status = res.status
    throw err
  }
  return text ? JSON.parse(text) : {}
}

const enc = (p) => p.split('/').filter(Boolean).map(encodeURIComponent).join('/')

/**
 * Libreria (drive) di destinazione. Senza `nomeLibreria` si prende quella
 * PREDEFINITA del sito: nell'URL si chiama "Documenti condivisi" ma Graph la
 * espone come "Documenti", quindi cercarla per nome è fragile.
 */
async function trovaDrive(token, siteId, nomeLibreria) {
  if (!nomeLibreria) {
    const drive = await graph(token, 'GET', `/sites/${siteId}/drive`)
    return { drive, tutti: [] }
  }
  const res = await graph(token, 'GET', `/sites/${siteId}/drives`)
  const drives = res.value ?? []
  const perNome = drives.find((d) => d.name.toLowerCase() === nomeLibreria.toLowerCase())
  return { drive: perNome ?? null, tutti: drives }
}

/** Verifica quali segmenti del percorso esistono; se CREA, crea i mancanti. */
async function verificaCartelle(token, driveId, path) {
  const segmenti = path.split('/').filter(Boolean)
  let corrente = ''
  const esito = []

  for (const segmento of segmenti) {
    const parent = corrente
    corrente = corrente ? `${corrente}/${segmento}` : segmento

    try {
      await graph(token, 'GET', `/drives/${driveId}/root:/${enc(corrente)}`)
      esito.push({ path: corrente, stato: 'ok' })
      continue
    } catch (err) {
      if (err.status !== 404) throw err
    }

    if (!CREA) {
      esito.push({ path: corrente, stato: 'manca' })
      // Senza --crea non si può scendere oltre: i figli non esistono per forza.
      return { esito, completo: false }
    }

    const target = parent
      ? `/drives/${driveId}/root:/${enc(parent)}:/children`
      : `/drives/${driveId}/root/children`
    await graph(token, 'POST', target, {
      name: segmento,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail',
    })
    esito.push({ path: corrente, stato: 'creata' })
  }
  return { esito, completo: true }
}

/** PDF minimo valido, per provare l'upload senza dipendenze. */
function pdfDiProva() {
  const body = `%PDF-1.1
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj
trailer<</Root 1 0 R>>
%%EOF`
  return Buffer.from(body, 'utf8')
}

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }

  const token = await getToken()

  console.log('\n→ Permessi dell\'app…')
  diagnosiPermessi(token)

  const anno = new Date().getFullYear()
  const cartella = CARTELLA_TEMPLATE.replace('{anno}', String(anno))
  // Vuoto = libreria predefinita del sito (comportamento identico a lib/archivio.ts)
  const nomeLibreria = process.env.SP_RICEVUTE_LIBRERIA || ''

  // 1. Sito
  const sitePath = SITO_ARG
    ? `coopmirafiorionlus.sharepoint.com:/sites/${SITO_ARG}`
    : process.env.SP_RICEVUTE_SITE || SITO_DEFAULT
  console.log(`\n→ Apro il sito ${sitePath}…`)
  const sito = await graph(token, 'GET', `/sites/${sitePath}`)
  console.log(`  ✓ ${sito.displayName}`)

  // 2. Libreria documenti
  console.log(
    nomeLibreria
      ? `\n→ Cerco la libreria "${nomeLibreria}"…`
      : '\n→ Uso la libreria predefinita del sito…',
  )
  const { drive, tutti } = await trovaDrive(token, sito.id, nomeLibreria)
  if (!drive) {
    console.log(
      `✗ Libreria "${nomeLibreria}" non trovata. Presenti: ${
        tutti.map((d) => d.name).join(', ') || 'nessuna'
      }`,
    )
    console.log('  Imposta SP_RICEVUTE_LIBRERIA con uno dei nomi qui sopra e rilancia.')
    process.exit(1)
  }
  console.log(`  ✓ ${drive.name}`)

  console.log(`\n── Destinazione ─────────────────────────────`)
  console.log(`Sito      : ${sito.displayName}`)
  console.log(`Web URL   : ${sito.webUrl}`)
  console.log(`Libreria  : ${drive.name}`)
  console.log(`Drive ID  : ${drive.id}`)
  console.log(`Cartella  : ${cartella}`)

  // 3. Cartelle
  console.log(`\n→ Verifico il percorso${CREA ? ' (creo le cartelle mancanti)' : ''}…`)
  const { esito, completo } = await verificaCartelle(token, drive.id, cartella)
  for (const e of esito) {
    const icona = e.stato === 'ok' ? '✓' : e.stato === 'creata' ? '+' : '✗'
    console.log(`  ${icona} ${e.path}${e.stato === 'creata' ? '  (creata)' : ''}`)
  }
  if (!completo) {
    console.log('\n! Percorso incompleto. Rilancia con --crea per creare le cartelle mancanti,')
    console.log('  oppure creale a mano da SharePoint e rilancia questo script.')
  }

  // 4. Upload di prova
  if (TEST && completo) {
    const nome = `_TEST_archivio_${Date.now()}.pdf`
    console.log(`\n→ Carico un PDF di prova (${nome})…`)
    const item = await graph(
      token,
      'PUT',
      `/drives/${drive.id}/root:/${enc(cartella)}/${encodeURIComponent(nome)}:/content`,
      pdfDiProva(),
      'application/pdf',
    )
    console.log(`  ✓ Caricato: ${item.webUrl}`)
    console.log('  (elimina il file di prova da SharePoint quando hai verificato)')
  }

  // 5. Env — opzionali: i default nel codice puntano già qui
  console.log(`\n── Variabili d'ambiente ─────────────────────`)
  console.log("Non sono necessarie: i default in lib/archivio.ts puntano già a questa")
  console.log('cartella. Impostare SP_RICEVUTE_DRIVE_ID è solo un\'ottimizzazione:')
  console.log('salta la risoluzione del sito (una chiamata Graph per cold start).\n')
  console.log('In .env.local:\n')
  console.log(`SP_RICEVUTE_DRIVE_ID=${drive.id}`)
  console.log('\nSu Vercel (da terminale, non dalla dashboard):\n')
  for (const env of ['production', 'preview', 'development']) {
    console.log(`printf '%s' '${drive.id}' | npx vercel env add SP_RICEVUTE_DRIVE_ID ${env}`)
  }
  console.log('\nPoi: npx vercel --prod  (le env si applicano al deploy successivo)')
  console.log('\nPer disattivare l\'archiviazione in locale: SP_RICEVUTE_OFF=1 in .env.local\n')
}

main().catch((err) => {
  console.error('\n✗', err.message)
  if (err.status === 403) {
    console.error(
      '\n  403 = permesso negato. Se sopra i permessi mostrano Sites.Selected, l\'app va\n' +
        '  autorizzata su questo sito specifico. Se mostrano Sites.ReadWrite.All, controlla\n' +
        '  che l\'admin consent sia stato concesso (in Azure la voce deve essere verde).',
    )
  }
  if (err.status === 404) {
    console.error(
      '\n  404 = risorsa inesistente. Se il sito non si trova, potrebbe stare in un tenant\n' +
        '  Microsoft 365 diverso: in quel caso le credenziali di questa app non valgono.',
    )
  }
  process.exit(1)
})
