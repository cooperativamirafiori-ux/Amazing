#!/usr/bin/env node
/**
 * Provisioning delle liste SharePoint dell'app Amazing: "Beni" e "Prenotazioni".
 *
 * Crea (se non esistono) le due liste con tutte le colonne usate da lib/lists.ts,
 * usando le credenziali Graph dell'app.
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-amazing.mjs
 *
 * Richiede in .env.local (o nell'ambiente):
 *   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, SHAREPOINT_SITE_ID
 *
 * Permesso Graph necessario: Sites.ReadWrite.All (Application).
 *
 * Idempotente: se una lista esiste già aggiunge solo le colonne mancanti.
 * Al termine stampa le righe SP_LIST_BENI=... e SP_LIST_PRENOTAZIONI=... da
 * incollare in .env.local e nelle Environment Variables su Vercel.
 *
 * NB: la colonna "Title" (predefinita) è usata come:
 *   - Beni         → nome del bene
 *   - Prenotazioni → id logico (timestamp)
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// I `name` DEVONO coincidere con quelli letti/scritti in lib/lists.ts
const LISTE = [
  {
    envKey: 'SP_LIST_BENI',
    name: 'Beni',
    columns: [
      { name: 'Descrizione', text: { allowMultipleLines: true } },
      { name: 'Prezzo', currency: { locale: 'it-IT' } },
      { name: 'Quantita', number: {} },
      { name: 'Venduti', number: {}, defaultValue: { value: '0' } },
      { name: 'Immagine', text: {} },
      { name: 'ImportoLibero', boolean: {} },
      { name: 'IdLogico', text: {} },
    ],
  },
  {
    envKey: 'SP_LIST_PRENOTAZIONI',
    name: 'Prenotazioni',
    columns: [
      { name: 'NumeroRicevuta', text: {} },
      { name: 'GoodId', text: {} },
      { name: 'GoodName', text: {} },
      { name: 'Nome', text: {} },
      { name: 'Cognome', text: {} },
      { name: 'Indirizzo', text: { allowMultipleLines: true } },
      { name: 'CodiceFiscale', text: {} },
      { name: 'Email', text: {} },
      { name: 'Importo', currency: { locale: 'it-IT' } },
      { name: 'Data', dateTime: { format: 'dateTime', displayAs: 'standard' } },
      { name: 'Metodo', text: {} },
      { name: 'Stato', text: {} },
      { name: 'PdfUrl', text: {} },
      { name: 'SatispayPaymentId', text: {} },
      { name: 'SatispayStatus', text: {} },
      { name: 'PaypalOrderId', text: {} },
    ],
  },
  {
    envKey: 'SP_LIST_ADMIN',
    name: 'AmazingAdmin',
    // Nessuna colonna extra: la colonna predefinita "Title" contiene l'email dell'admin.
    columns: [],
  },
]

// --- carica .env.local se le env non sono già nell'ambiente ---
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

/** Aggiunge alla lista esistente le sole colonne mancanti (idempotente) */
async function ensureColumns(token, site, listId, columns) {
  const cols = await graph(token, 'GET', `/sites/${site}/lists/${listId}/columns?$select=name&$top=200`)
  const present = new Set((cols.value || []).map((c) => c.name))
  const mancanti = columns.filter((c) => !present.has(c.name))
  if (!mancanti.length) {
    console.log('  ✓ Tutte le colonne sono già presenti.')
    return
  }
  for (const col of mancanti) {
    await graph(token, 'POST', `/sites/${site}/lists/${listId}/columns`, col)
    console.log(`  + colonna aggiunta: ${col.name}`)
  }
}

async function provisionLista(token, site, lista) {
  console.log(`\n→ Lista "${lista.name}"...`)
  const existing = await graph(token, 'GET', `/sites/${site}/lists?$select=id,displayName&$top=200`)
  const found = (existing.value || []).find((l) => l.displayName === lista.name)
  if (found) {
    console.log(`  ✓ Esiste già. ID = ${found.id}`)
    await ensureColumns(token, site, found.id, lista.columns)
    return { envKey: lista.envKey, id: found.id }
  }
  const created = await graph(token, 'POST', `/sites/${site}/lists`, {
    displayName: lista.name,
    list: { template: 'genericList' },
    columns: lista.columns,
  })
  console.log(`  ✓ Creata. ID = ${created.id}`)
  return { envKey: lista.envKey, id: created.id }
}

async function main() {
  loadEnvLocal()
  const site = process.env.SHAREPOINT_SITE_ID
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }

  console.log('→ Autenticazione Graph...')
  const token = await getToken()

  const risultati = []
  for (const lista of LISTE) {
    risultati.push(await provisionLista(token, site, lista))
  }

  console.log('\n============================================================')
  console.log('Aggiungi queste righe a .env.local e alle Environment Variables su Vercel:\n')
  for (const r of risultati) console.log(`  ${r.envKey}=${r.id}`)
  console.log('\n============================================================')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
