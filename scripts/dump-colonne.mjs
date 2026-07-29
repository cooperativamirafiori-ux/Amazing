#!/usr/bin/env node
/**
 * Diagnostica: stampa le colonne (nome interno + tipo) delle liste Beni e
 * Prenotazioni, per allineare gli script di import/provisioning.
 *
 * Uso (dalla cartella web/):  node scripts/dump-colonne.mjs
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
async function graph(token, path) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`)
  return res.json()
}
function tipo(c) {
  for (const k of ['text','number','currency','boolean','dateTime','choice','hyperlinkOrPicture','lookup','personOrGroup','calculated'])
    if (c[k]) return k
  return 'altro'
}
async function main() {
  loadEnvLocal()
  const site = process.env.SHAREPOINT_SITE_ID
  const token = await getToken()
  for (const [label, id] of [['BENI', process.env.SP_LIST_BENI], ['PRENOTAZIONI', process.env.SP_LIST_PRENOTAZIONI]]) {
    if (!id) continue
    const cols = await graph(token, `/sites/${site}/lists/${id}/columns?$top=200`)
    console.log(`\n=== ${label} (${id}) ===`)
    for (const c of cols.value) {
      console.log(`  ${c.name}  [${tipo(c)}]${c.readOnly ? ' (readOnly)' : ''}`)
    }
  }
}
main().catch((e) => { console.error('ERRORE:', e.message); process.exit(1) })
