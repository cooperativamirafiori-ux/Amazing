/**
 * Client Satispay Business API (server-side).
 *
 * Portato dalla vecchia app Apps Script (Code_v4.gs): autenticazione con
 * HTTP Signature (keyId + RSA-SHA256 sugli header `(request-target) host date
 * digest`), creazione pagamento con flusso MATCH_CODE e lettura stato.
 *
 * Credenziali da env (NON hardcodare):
 *   SATISPAY_KEY_ID      = keyId rilasciato/attivato per la chiave RSA
 *   SATISPAY_PRIVATE_KEY = chiave privata RSA in PEM (\n reali o "\n" letterali)
 *   SATISPAY_ENV         = "production" (default) | "sandbox"
 *
 * NB: il keyId attuale e la relativa chiave privata sono ancora presenti in
 * chiaro dentro Code_v4.gs della vecchia app → vanno ruotati su Satispay
 * Business e impostati qui solo via variabili d'ambiente.
 */
import { createSign, createHash } from 'node:crypto'

function apiHost(): string {
  const env = (process.env.SATISPAY_ENV || 'production').trim().toLowerCase()
  return env === 'sandbox' ? 'staging.authservices.satispay.com' : 'authservices.satispay.com'
}

function apiBase(): string {
  return `https://${apiHost()}`
}

function keyId(): string {
  const v = String(process.env.SATISPAY_KEY_ID || '').trim()
  if (!v) throw new Error('SATISPAY_KEY_ID non configurato')
  return v
}

function privateKey(): string {
  // supporta sia PEM con a-capo reali sia con "\n" letterali (env di una riga)
  const v = String(process.env.SATISPAY_PRIVATE_KEY || '').trim().replace(/\\n/g, '\n')
  if (!v) throw new Error('SATISPAY_PRIVATE_KEY non configurato')
  return v
}

function dateHeader(): string {
  // RFC 1123 in GMT, es. "Wed, 08 Jul 2026 09:00:00 GMT"
  return new Date().toUTCString()
}

function digestHeader(body: string): string {
  const hash = createHash('sha256').update(body || '', 'utf8').digest('base64')
  return `SHA-256=${hash}`
}

function authorizationHeader(method: string, path: string, date: string, digest: string): string {
  const signingString = [
    `(request-target): ${method.toLowerCase()} ${path}`,
    `host: ${apiHost()}`,
    `date: ${date}`,
    `digest: ${digest}`,
  ].join('\n')
  const signature = createSign('RSA-SHA256').update(signingString).sign(privateKey(), 'base64')
  return `Signature keyId="${keyId()}",algorithm="rsa-sha256",headers="(request-target) host date digest",signature="${signature}"`
}

async function satispayRequest<T = any>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<T> {
  const payload = body ? JSON.stringify(body) : ''
  const date = dateHeader()
  const digest = digestHeader(payload)

  const headers: Record<string, string> = {
    Date: date,
    Digest: digest,
    Authorization: authorizationHeader(method, path, date, digest),
    Accept: 'application/json',
  }
  if (payload) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers,
    body: payload || undefined,
    cache: 'no-store',
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Satispay ${res.status}: ${text}`)
  return (text ? JSON.parse(text) : {}) as T
}

export interface SatispayPayment {
  id: string
  status: string // PENDING | ACCEPTED | CANCELED
  redirect_url?: string
  [k: string]: unknown
}

/**
 * Crea un pagamento Satispay (flusso MATCH_CODE): l'utente viene rediretto a
 * `redirect_url` per pagare; al termine Satispay chiama `callback_url` (S2S) e
 * riporta il browser su `redirect_url`.
 */
export async function createSatispayPayment(args: {
  importo: number
  externalCode: string
  callbackUrl: string
  redirectUrl: string
  bookingId: string
  email: string
}): Promise<SatispayPayment> {
  return satispayRequest<SatispayPayment>('POST', '/g_business/v1/payments', {
    flow: 'MATCH_CODE',
    amount_unit: Math.round(Number(args.importo) * 100),
    currency: 'EUR',
    callback_url: args.callbackUrl,
    redirect_url: args.redirectUrl,
    external_code: args.externalCode,
    metadata: {
      booking_id: args.bookingId,
      receipt_code: args.externalCode,
      email: args.email,
    },
  })
}

export async function getSatispayPayment(paymentId: string): Promise<SatispayPayment> {
  return satispayRequest<SatispayPayment>(
    'GET',
    `/g_business/v1/payments/${encodeURIComponent(paymentId)}`
  )
}
