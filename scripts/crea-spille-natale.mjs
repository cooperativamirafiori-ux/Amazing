#!/usr/bin/env node
/**
 * Spille della vetrina "Natale 2026" (vedi lib/spille.ts).
 *
 * 1. Crea le colonne (testo su più righe: il JSON supera i 255 caratteri):
 *      Lista Beni          Varianti, VendutiVarianti
 *      Lista Prenotazioni  Righe
 * 2. Crea il prodotto "Spille" nella vetrina Natale con 30 pezzi per ogni
 *    soggetto e misura (12 soggetti × 3 misure = 1080 spille).
 *
 * VA ESEGUITO PRIMA (o subito dopo) il deploy del codice: senza le colonne
 * Graph rifiuta le prenotazioni di spille.
 *
 * Uso (dalla cartella web/):
 *   node scripts/crea-spille-natale.mjs
 *
 * Idempotente: colonne già presenti saltate; se esiste già un prodotto con le
 * varianti non ne crea un secondo. Soggetti e misure devono restare allineati
 * a lib/spille.ts.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const TESTO_LUNGO = { text: { allowMultipleLines: true, textType: 'plain', linesForEditing: 6 } }

const LISTE = [
  {
    env: 'SP_LIST_BENI',
    nome: 'Beni',
    colonne: [
      { name: 'Varianti', ...TESTO_LUNGO },
      { name: 'VendutiVarianti', ...TESTO_LUNGO },
    ],
  },
  {
    env: 'SP_LIST_PRENOTAZIONI',
    nome: 'Prenotazioni',
    colonne: [{ name: 'Righe', ...TESTO_LUNGO }],
  },
]

// Allineati a SOGGETTI_SPILLE e MISURE_SPILLE in lib/spille.ts.
const SOGGETTI = [
  'MA-CIAO', 'PAPPAGALLO', 'TOILETTE-KING', 'SCHIENA', 'SPLASH', 'VOLPINA',
  'PESCE-SQUALO', 'DRAGHETTO', 'TI-PENSO', 'LIMONI', 'OCA-REALE', 'TUFFO-DOLCE',
]
const MISURE = ['P', 'M', 'G']
const SCORTA = 30

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

  const beni = `/sites/${site}/lists/${process.env.SP_LIST_BENI}/items`
  console.log('→ Prodotto Spille...')
  const esistenti = await graph(
    token,
    'GET',
    `${beni}?$expand=fields($select=Title,Varianti)&$top=500`
  )
  const gia = (esistenti.value || []).find((i) => String(i.fields?.Varianti ?? '').trim())
  if (gia) {
    console.log(`  ✓ Esiste già: "${gia.fields.Title}" (id ${gia.id}). Le scorte si cambiano dall'admin.`)
    console.log('Fatto.')
    return
  }

  const varianti = {}
  for (const s of SOGGETTI) for (const m of MISURE) varianti[`${s}|${m}`] = SCORTA
  const totale = SOGGETTI.length * MISURE.length * SCORTA

  const creato = await graph(token, 'POST', beni, {
    fields: {
      Title: 'Spille',
      Descrizione:
        'Spille disegnate a mano da Griselda Desclos e Stefania Lapone: 12 soggetti in tre misure. Scegli quante ne vuoi di ognuno in un solo ordine.',
      Prezzo: 2,
      Quantita: totale,
      Venduti: 0,
      Immagine: '/natale/spille/copertina.jpg',
      ImportoLibero: false,
      IdLogico: Date.now().toString(),
      Canale: '',
      Sezione: 'NATALE',
      Varianti: JSON.stringify(varianti),
      VendutiVarianti: '',
    },
  })
  console.log(`  + Creato "Spille" (id ${creato.id}): ${totale} spille, ${SCORTA} per soggetto e misura.`)
  console.log('Fatto.')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
