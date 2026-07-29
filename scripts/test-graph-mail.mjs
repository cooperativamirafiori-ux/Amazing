#!/usr/bin/env node
/**
 * Verifica end-to-end dei permessi Microsoft Graph usati dall'app per
 * l'invio email (ricevute + mail di ritiro): autenticazione client
 * credentials + invio reale di una mail di prova "come" MAIL_SENDER_EMAIL.
 *
 * Uso (dalla cartella web/):
 *   node scripts/test-graph-mail.mjs                    → invia a MAIL_SENDER_EMAIL stesso
 *   node scripts/test-graph-mail.mjs altra@email.com     → invia al destinatario indicato
 *
 * Richiede in .env.local (o nell'ambiente):
 *   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, MAIL_SENDER_EMAIL
 *
 * Non serve nessun permesso in più oltre a quelli già richiesti dall'app
 * (Mail.Send, Application). Questo script isola il problema: se fallisce QUI,
 * il problema è a monte (Entra/Exchange), non nel codice dell'app.
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
  const text = await res.text()
  if (!res.ok) {
    const err = new Error(`Token error ${res.status}: ${text}`)
    err.status = res.status
    err.body = text
    throw err
  }
  return JSON.parse(text).access_token
}

async function sendTestMail(token, sender, destinatario) {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: 'Test permessi Graph — App Amazing',
          body: {
            contentType: 'Text',
            content: `Email di prova inviata da ${sender} il ${new Date().toLocaleString('it-IT')}.\n\nSe la ricevi, i permessi Graph Mail.Send funzionano correttamente per questa casella.`,
          },
          toRecipients: [{ emailAddress: { address: destinatario } }],
        },
        saveToSentItems: true,
      }),
    },
  )
  const text = await res.text()
  return { status: res.status, body: text }
}

function spiegaErrore(status, body) {
  console.log('\n  Diagnosi:')
  if (status === 401) {
    console.log('  → 401 Unauthorized: GRAPH_TENANT_ID/GRAPH_CLIENT_ID/GRAPH_CLIENT_SECRET errati o scaduti.')
    console.log('    Controlla il Client Secret nell\'App Registration (potrebbe essere scaduto).')
  } else if (status === 403) {
    console.log('  → 403 Forbidden: il token è valido ma manca l\'autorizzazione a inviare.')
    console.log('    Cause più probabili:')
    console.log('    1) Il permesso Mail.Send (Application) NON ha il "Grant admin consent" nell\'App')
    console.log('       Registration (Entra ID → API permissions). Deve avere la spunta verde.')
    console.log('    2) Esiste una Application Access Policy su Exchange Online che limita l\'app a')
    console.log('       inviare solo da alcune caselle, e questa non è tra quelle abilitate.')
    console.log('       Verifica con: Get-ApplicationAccessPolicy (Exchange Online PowerShell).')
  } else if (status === 404) {
    console.log('  → 404 Not Found: la casella mittente non esiste o non è visibile a Graph.')
    console.log('    Verifica che MAIL_SENDER_EMAIL sia scritta esattamente come la mailbox in M365.')
  } else if (status >= 500) {
    console.log('  → Errore lato Microsoft: riprova tra qualche minuto.')
  } else {
    console.log('  → Controlla il corpo della risposta sopra per il dettaglio esatto.')
  }
}

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'MAIL_SENDER_EMAIL']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }

  const sender = process.env.MAIL_SENDER_EMAIL
  const destinatario = process.argv[2] || sender

  console.log(`→ Mittente (MAIL_SENDER_EMAIL): ${sender}`)
  console.log(`→ Destinatario test: ${destinatario}`)

  console.log('\n→ Passo 1/2: autenticazione Graph (client credentials)...')
  let token
  try {
    token = await getToken()
    console.log('  ✓ Token ottenuto correttamente. Le credenziali dell\'App Registration sono valide.')
  } catch (err) {
    console.log(`  ✗ FALLITO: ${err.message}`)
    spiegaErrore(err.status, err.body)
    process.exit(1)
  }

  console.log('\n→ Passo 2/2: invio email di prova (verifica permesso Mail.Send)...')
  const { status, body } = await sendTestMail(token, sender, destinatario)
  if (status === 202 || status === 200 || status === 204) {
    console.log(`  ✓ Email inviata con successo (HTTP ${status}).`)
    console.log(`\n============================================================`)
    console.log(`✓ TUTTO OK: i permessi Graph funzionano per la casella ${sender}.`)
    console.log(`  Controlla la casella di ${destinatario} (anche posta indesiderata) per conferma.`)
    console.log(`============================================================`)
  } else {
    console.log(`  ✗ FALLITO (HTTP ${status})`)
    console.log(`  Risposta Graph: ${body}`)
    spiegaErrore(status, body)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('\n✗ ERRORE IMPREVISTO:', err.message)
  process.exit(1)
})
