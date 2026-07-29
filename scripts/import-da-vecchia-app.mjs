#!/usr/bin/env node
/**
 * Importa i dati della vecchia app (Google Sheets) nelle liste SharePoint nuove.
 *
 * Sorgenti: due CSV esportati dal vecchio Google Sheet.
 *   - foglio "Beni"         → beni.csv         (colonne A-G, con riga di intestazione)
 *   - foglio "Prenotazioni" → prenotazioni.csv (colonne A-P, con riga di intestazione)
 *
 * Uso (dalla cartella web/):
 *   node scripts/import-da-vecchia-app.mjs ./beni.csv ./prenotazioni.csv
 *   node scripts/import-da-vecchia-app.mjs ./beni.csv           (solo catalogo)
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 *   SHAREPOINT_SITE_ID, SP_LIST_BENI, SP_LIST_PRENOTAZIONI
 *
 * Idempotente: salta le righe il cui IdLogico è già presente nelle liste
 * (così puoi rilanciarlo senza creare duplicati).
 *
 * Mappatura per POSIZIONE di colonna (non per intestazione), quindi funziona
 * qualunque siano le etichette degli header:
 *   Beni A-G:  id, name, description, price, quantity, image, flexibleAmount
 *   Pren A-P:  id, numero_ricevuta, goodId, goodName, nome, cognome, indirizzo,
 *              codice_fiscale, email, importo, data, metodo, stato, pdf_url,
 *              satispay_payment_id, satispay_status
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ---------- env ----------
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

// ---------- Graph ----------
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
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : {}
}

// ---------- CSV parser (gestisce virgolette, virgole e a-capo nei campi) ----------
function parseCSV(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  text = text.replace(/^﻿/, '') // togli BOM
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((v) => v !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((v) => v !== '')) rows.push(row) }
  return rows
}

function normalizeStatus(raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (['pending', 'pending_paypal', 'pending_satispay', 'pending_bonifico', 'in_attesa'].includes(s)) return 'pending'
  if (['paid', 'pagato'].includes(s)) return 'paid'
  if (['annullato', 'canceled', 'cancelled'].includes(s)) return 'annullato'
  if (['consegnato', 'delivered'].includes(s)) return 'consegnato'
  return 'pending'
}

const num = (v) => Number(String(v ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')) || 0
const bool = (v) => String(v ?? '').trim().toLowerCase() === 'true' || v === true

/** "gg/MM/aaaa HH:mm:ss" (o altre) → ISO 8601, oppure '' se non parsabile. */
function toISO(s) {
  const t = String(s ?? '').trim()
  if (!t) return ''
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) {
    const [, d, mo, y, h = '0', mi = '0', se = '0'] = m
    const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se))
    return isNaN(dt.getTime()) ? '' : dt.toISOString()
  }
  const dt = new Date(t)
  return isNaN(dt.getTime()) ? '' : dt.toISOString()
}

async function listExistingIds(token, site, listId, campo) {
  const out = new Set()
  let url = `/sites/${site}/lists/${listId}/items?$expand=fields($select=${campo})&$top=500`
  while (url) {
    const res = await graph(token, 'GET', url)
    for (const it of res.value || []) {
      const v = String(it.fields?.[campo] ?? '').trim()
      if (v) out.add(v)
    }
    url = res['@odata.nextLink'] ? res['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '') : null
  }
  return out
}

async function main() {
  loadEnvLocal()
  const [beniCsv, prenCsv] = process.argv.slice(2)
  if (!beniCsv && !prenCsv) {
    console.error('Uso: node scripts/import-da-vecchia-app.mjs ./beni.csv [./prenotazioni.csv]')
    process.exit(1)
  }
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID', 'SP_LIST_BENI']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const site = process.env.SHAREPOINT_SITE_ID
  const LB = process.env.SP_LIST_BENI
  const LP = process.env.SP_LIST_PRENOTAZIONI

  console.log('→ Autenticazione Graph...')
  const token = await getToken()

  const venduti = {} // goodId(logico) -> conteggio prenotazioni non annullate

  // ---------- BENI ----------
  if (beniCsv) {
    console.log(`\n→ Import beni da ${beniCsv}`)
    const rows = parseCSV(readFileSync(beniCsv, 'utf8')).slice(1) // salta header
    const esistenti = await listExistingIds(token, site, LB, 'IdLogico')
    const senzaFoto = []
    let creati = 0, saltati = 0, errori = 0
    for (const r of rows) {
      const [id, name, description, price, quantity, image, flexibleAmount] = r
      if (!String(name ?? '').trim()) continue
      const idLog = String(id ?? '').trim() || String(Date.now())
      if (esistenti.has(idLog)) { saltati++; continue }
      // La colonna Immagine è testo (max 255): le immagini "data:" base64 non entrano.
      const img = String(image ?? '')
      const immagineValida = img && !img.startsWith('data:') && img.length <= 255
      if (img && !immagineValida) senzaFoto.push(name)
      const fields = {
        Title: name, Descrizione: description ?? '', Prezzo: num(price),
        Quantita: num(quantity), Venduti: 0, Immagine: immagineValida ? img : '',
        ImportoLibero: bool(flexibleAmount), IdLogico: idLog,
      }
      try {
        await graph(token, 'POST', `/sites/${site}/lists/${LB}/items`, { fields })
        creati++
      } catch (e) {
        errori++
        console.log(`  ✗ bene "${name}" (IdLogico=${idLog}): ${e.message}`)
        console.log(`    payload: ${JSON.stringify(fields)}`)
      }
    }
    console.log(`  ✓ beni creati: ${creati}, saltati: ${saltati}, errori: ${errori}`)
    if (senzaFoto.length) {
      console.log(`  ⚠ ${senzaFoto.length} bene/i importati SENZA foto (immagine base64 non supportata). Aggiungi un URL immagine dall'admin per:`)
      senzaFoto.forEach((n) => console.log(`      - ${n}`))
    }
  }

  // ---------- PRENOTAZIONI ----------
  if (prenCsv && LP) {
    console.log(`\n→ Import prenotazioni da ${prenCsv}`)
    const rows = parseCSV(readFileSync(prenCsv, 'utf8')).slice(1)
    const esistenti = await listExistingIds(token, site, LP, 'Title')
    let creati = 0, saltati = 0, errori = 0
    for (const r of rows) {
      const [id, numRic, goodId, goodName, nome, cognome, indirizzo, cf, email,
             importo, data, metodo, stato, pdfUrl] = r
      const idLog = String(id ?? '').trim()
      if (!idLog) continue
      const st = normalizeStatus(stato)
      if (st !== 'annullato' && goodId) venduti[String(goodId).trim()] = (venduti[String(goodId).trim()] || 0) + 1
      if (esistenti.has(idLog)) { saltati++; continue }
      const fields = {
        Title: idLog, NumeroRicevuta: numRic ?? '', GoodId: String(goodId ?? '').trim(),
        GoodName: goodName ?? '', Nome: nome ?? '', Cognome: cognome ?? '',
        Indirizzo: indirizzo ?? '', CodiceFiscale: cf ?? '', Email: email ?? '',
        Importo: num(importo), Metodo: (metodo ?? '').toString().toLowerCase(),
        Stato: st, PdfUrl: pdfUrl ?? '',
      }
      const iso = toISO(data)
      if (iso) fields.Data = iso
      try {
        await graph(token, 'POST', `/sites/${site}/lists/${LP}/items`, { fields })
        creati++
      } catch (e) {
        errori++
        console.log(`  ✗ prenotazione ${idLog}: ${e.message}`)
        console.log(`    payload: ${JSON.stringify(fields)}`)
      }
    }
    console.log(`  ✓ prenotazioni create: ${creati}, saltate: ${saltati}, errori: ${errori}`)
  } else if (prenCsv && !LP) {
    console.log('  ⚠ SP_LIST_PRENOTAZIONI non impostata: salto le prenotazioni')
  }

  // ---------- ricalcolo Venduti sui beni ----------
  if (prenCsv && Object.keys(venduti).length) {
    console.log('\n→ Ricalcolo disponibilità (Venduti) sui beni...')
    const beni = await graph(token, 'GET', `/sites/${site}/lists/${LB}/items?$expand=fields($select=IdLogico)&$top=500`)
    for (const it of beni.value || []) {
      const idLog = String(it.fields?.IdLogico ?? '').trim()
      const v = venduti[idLog] || 0
      await graph(token, 'PATCH', `/sites/${site}/lists/${LB}/items/${it.id}/fields`, { Venduti: v })
    }
    console.log('  ✓ Venduti aggiornati')
  }

  console.log('\n✓ Import completato.')
}

main().catch((err) => { console.error('\n✗ ERRORE:', err.message); process.exit(1) })
