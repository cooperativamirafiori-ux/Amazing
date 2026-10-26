#!/usr/bin/env node
/**
 * Prepara SharePoint per la pagina /dona ("Donazioni Cooperativa Sociale
 * Mirafiori", ricevute serie MIR):
 *
 *  1. aggiunge alla lista Beni la colonna di testo "Canale"
 *     (vuota = catalogo Amazing, "MIR" = progetto della pagina /dona);
 *  2. crea il primo progetto "Dove serve di più" (canale MIR, importo libero),
 *     copiando la donazione minima dalla "Donazione Libera" di Amazing.
 *
 * Gli altri progetti si aggiungono poi dall'admin → Catalogo, scegliendo
 * "Dove compare: Pagina Donazioni Cooperativa".
 *
 * Uso (dalla cartella web/):
 *   node scripts/setup-donazioni-mir.mjs
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID, SP_LIST_BENI. Idempotente: si può rilanciare.
 *
 * VA ESEGUITO PRIMA del push del codice che legge la colonna Canale.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PRIMO_PROGETTO = {
  Title: 'Dove serve di più',
  Descrizione: 'La destiniamo noi alle attività che in questo momento ne hanno più bisogno.',
}

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const val = m[2].replace(/^["']|["']$/g, '')
      if (!process.env[m[1]]) process.env[m[1]] = val
    }
  } catch {
    // .env.local assente: si presume env già impostate
  }
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
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : {}
}

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID', 'SP_LIST_BENI']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const site = process.env.SHAREPOINT_SITE_ID
  const list = process.env.SP_LIST_BENI
  const token = await getToken()

  // 1. Colonna Canale
  const cols = await graph(token, 'GET', `/sites/${site}/lists/${list}/columns?$select=name&$top=200`)
  if ((cols.value || []).some((c) => c.name === 'Canale')) {
    console.log('✓ Colonna "Canale" già presente nella lista Beni.')
  } else {
    await graph(token, 'POST', `/sites/${site}/lists/${list}/columns`, { name: 'Canale', text: {} })
    console.log('✓ Colonna "Canale" aggiunta alla lista Beni.')
  }

  // 2. Primo progetto MIR
  const items = await graph(
    token,
    'GET',
    `/sites/${site}/lists/${list}/items?$expand=fields($select=Title,Prezzo,ImportoLibero,Canale)&$top=500`
  )
  const beni = items.value || []
  const mir = beni.filter((i) => String(i.fields?.Canale ?? '').toUpperCase() === 'MIR')
  if (mir.length) {
    console.log(`✓ Progetti MIR già presenti: ${mir.map((i) => i.fields.Title).join(', ')}`)
  } else {
    const libera = beni.find(
      (i) => i.fields?.ImportoLibero === true && String(i.fields?.Canale ?? '').toUpperCase() !== 'MIR'
    )
    const minimo = Number(libera?.fields?.Prezzo ?? 1) || 1
    await graph(token, 'POST', `/sites/${site}/lists/${list}/items`, {
      fields: {
        ...PRIMO_PROGETTO,
        Prezzo: minimo,
        Quantita: 1000000,
        Venduti: 0,
        Immagine: '',
        ImportoLibero: true,
        IdLogico: Date.now().toString(),
        Canale: 'MIR',
      },
    })
    console.log(`✓ Creato il progetto "${PRIMO_PROGETTO.Title}" (donazione minima € ${minimo.toFixed(2)}).`)
  }

  console.log('\nFatto. Ora puoi fare git push: la pagina sarà su /dona.')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
