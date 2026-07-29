#!/usr/bin/env node
/**
 * Aggiunge la colonna "Consegnato" (Sì/No) alla lista SharePoint "Prenotazioni",
 * usata per lo Stato consegna nell'area admin (indipendente dallo Stato
 * pagamento).
 *
 * Uso (dalla cartella web/):
 *   node scripts/add-colonna-consegnato.mjs
 *
 * Richiede in .env.local (o nell'ambiente):
 *   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 *   SHAREPOINT_SITE_ID, SP_LIST_PRENOTAZIONI
 *
 * Permesso Graph necessario: Sites.ReadWrite.All (Application).
 *
 * Idempotente: se la colonna esiste già non fa nulla.
 *
 * Nota: la stessa colonna è ora presente anche in scripts/provision-amazing.mjs,
 * quindi su un ambiente nuovo basta quello script; questo serve per aggiungerla
 * a una lista "Prenotazioni" già esistente senza dover ri-eseguire tutto il
 * provisioning.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const COLONNA = { name: 'Consegnato', boolean: {} }

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

async function main() {
  loadEnvLocal()
  for (const k of [
    'GRAPH_TENANT_ID',
    'GRAPH_CLIENT_ID',
    'GRAPH_CLIENT_SECRET',
    'SHAREPOINT_SITE_ID',
    'SP_LIST_PRENOTAZIONI',
  ]) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }

  const site = process.env.SHAREPOINT_SITE_ID
  const listId = process.env.SP_LIST_PRENOTAZIONI

  console.log('→ Autenticazione Graph...')
  const token = await getToken()

  console.log(`→ Controllo colonne della lista Prenotazioni (${listId})...`)
  const cols = await graph(token, 'GET', `/sites/${site}/lists/${listId}/columns?$select=name&$top=200`)
  const present = new Set((cols.value || []).map((c) => c.name))

  if (present.has(COLONNA.name)) {
    console.log(`  ✓ La colonna "${COLONNA.name}" esiste già. Nessuna modifica necessaria.`)
    return
  }

  console.log(`→ Aggiungo la colonna "${COLONNA.name}" (Sì/No)...`)
  await graph(token, 'POST', `/sites/${site}/lists/${listId}/columns`, COLONNA)
  console.log(`  ✓ Colonna "${COLONNA.name}" aggiunta con successo.`)
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
