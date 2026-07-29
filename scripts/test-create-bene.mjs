#!/usr/bin/env node
/**
 * Diagnostica: crea un item di prova nella lista Beni e aggiunge i campi uno
 * alla volta, per isolare quale colonna/tipo fa fallire la scrittura (400).
 * Alla fine elimina l'item di prova.
 *
 * Uso (dalla cartella web/):  node scripts/test-create-bene.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))
function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {}
}
async function getToken() {
  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env
  const res = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: GRAPH_CLIENT_ID, client_secret: GRAPH_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default' }),
  })
  if (!res.ok) throw new Error(await res.text())
  return (await res.json()).access_token
}
async function g(token, method, path, body) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : {} }
}
async function main() {
  loadEnvLocal()
  const site = process.env.SHAREPOINT_SITE_ID
  const L = process.env.SP_LIST_BENI
  const token = await getToken()

  console.log('→ creo item di prova con solo Title...')
  const created = await g(token, 'POST', `/sites/${site}/lists/${L}/items`, { fields: { Title: '__TEST_IMPORT__' } })
  if (!created.ok) { console.log('  FAIL anche solo Title:', JSON.stringify(created.body)); return }
  const id = created.body.id
  console.log('  OK, id =', id)

  const prove = [
    ['IdLogico (text)', { IdLogico: '9999999999999' }],
    ['Descrizione (text)', { Descrizione: 'prova' }],
    ['Prezzo (currency)', { Prezzo: 10 }],
    ['Quantita (number)', { Quantita: 1000 }],
    ['Venduti (number)', { Venduti: 0 }],
    ['Immagine (text)', { Immagine: 'https://www.cooperativaspico.com/logo.png' }],
    ['ImportoLibero (boolean)', { ImportoLibero: true }],
  ]
  for (const [label, fields] of prove) {
    const r = await g(token, 'PATCH', `/sites/${site}/lists/${L}/items/${id}/fields`, fields)
    console.log(`  ${r.ok ? 'OK  ' : 'FAIL'} ${label}${r.ok ? '' : ' → ' + JSON.stringify(r.body?.error?.message || r.body)}`)
  }

  console.log('→ elimino item di prova...')
  await g(token, 'DELETE', `/sites/${site}/lists/${L}/items/${id}`)
  console.log('✓ fatto')
}
main().catch((e) => { console.error('ERRORE:', e.message); process.exit(1) })
