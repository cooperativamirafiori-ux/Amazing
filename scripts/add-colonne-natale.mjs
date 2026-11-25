#!/usr/bin/env node
/**
 * Colonne SharePoint per la vetrina "Natale 2026" (vedi lib/natale.ts):
 *
 *   Lista Beni
 *     - Sezione        (testo: vuoto = catalogo Amazing, "NATALE" = pagina /natale)
 *     - Taglie         (testo JSON: scorta per taglia, es. {"S":5,"M":10})
 *     - VendutiTaglie  (testo JSON: pezzi riservati/venduti per taglia)
 *   Lista Prenotazioni
 *     - Taglia         (testo: S, M, L, XL)
 *     - Pezzi          (numero: quanti pezzi dello stesso prodotto)
 *
 * VA ESEGUITO PRIMA del deploy del codice: se le colonne non esistono, Graph
 * rifiuta la creazione di prodotti e prenotazioni di Natale.
 *
 * Uso (dalla cartella web/):
 *   node scripts/add-colonne-natale.mjs
 *
 * Richiede in .env.local (o nell'ambiente):
 *   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 *   SHAREPOINT_SITE_ID, SP_LIST_BENI, SP_LIST_PRENOTAZIONI
 *
 * Idempotente: le colonne già presenti vengono saltate.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const LISTE = [
  {
    env: 'SP_LIST_BENI',
    nome: 'Beni',
    colonne: [
      { name: 'Sezione', text: {} },
      { name: 'Taglie', text: {} },
      { name: 'VendutiTaglie', text: {} },
    ],
  },
  {
    env: 'SP_LIST_PRENOTAZIONI',
    nome: 'Prenotazioni',
    colonne: [
      { name: 'Taglia', text: {} },
      { name: 'Pezzi', number: {} },
    ],
  },
]

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
    'SP_LIST_BENI',
    'SP_LIST_PRENOTAZIONI',
  ]) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }

  const site = process.env.SHAREPOINT_SITE_ID

  console.log('→ Autenticazione Graph...')
  const token = await getToken()

  for (const lista of LISTE) {
    const listId = process.env[lista.env]
    console.log(`→ Lista ${lista.nome} (${listId})...`)
    const cols = await graph(token, 'GET', `/sites/${site}/lists/${listId}/columns?$select=name&$top=200`)
    const present = new Set((cols.value || []).map((c) => c.name))
    for (const col of lista.colonne) {
      if (present.has(col.name)) {
        console.log(`  ✓ "${col.name}" esiste già.`)
        continue
      }
      await graph(token, 'POST', `/sites/${site}/lists/${listId}/columns`, col)
      console.log(`  + "${col.name}" aggiunta.`)
    }
  }
  console.log('Fatto.')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
