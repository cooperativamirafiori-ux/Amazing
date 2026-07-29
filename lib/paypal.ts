/**
 * Client PayPal Orders API v2 (server-side).
 *
 * Portato dalla vecchia app Apps Script (Code_v4.gs): token OAuth con client
 * credentials, creazione ordine intent CAPTURE, cattura con chiave di
 * idempotenza.
 *
 * Credenziali da env (NON hardcodare):
 *   PAYPAL_CLIENT_ID
 *   PAYPAL_CLIENT_SECRET
 *   PAYPAL_MODE = "live" (default) | "sandbox"
 */

function apiBase(): string {
  const mode = (process.env.PAYPAL_MODE || 'live').trim().toLowerCase()
  return mode === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID
  const secret = process.env.PAYPAL_CLIENT_SECRET
  if (!clientId || !secret) {
    throw new Error('Credenziali PayPal non configurate (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET)')
  }
  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  })
  const body = await res.json()
  if (!body.access_token) throw new Error('PayPal token error: ' + JSON.stringify(body))
  return body.access_token as string
}

export interface PaypalOrder {
  id?: string
  status?: string
  links?: { rel: string; href: string }[]
  message?: string
  [k: string]: unknown
}

/** Crea un ordine PayPal (intent CAPTURE) e ritorna l'ordine con il link "approve". */
export async function createPaypalOrder(args: {
  importo: number
  descrizione: string
  bookingId: string
  returnUrl: string
  cancelUrl: string
}): Promise<PaypalOrder> {
  const token = await getAccessToken()
  const res = await fetch(`${apiBase()}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: { currency_code: 'EUR', value: Number(args.importo).toFixed(2) },
          description: args.descrizione.slice(0, 127),
          custom_id: args.bookingId,
        },
      ],
      application_context: {
        return_url: args.returnUrl,
        cancel_url: args.cancelUrl,
        brand_name: 'Cooperativa Mirafiori',
        user_action: 'PAY_NOW',
      },
    }),
    cache: 'no-store',
  })
  return (await res.json()) as PaypalOrder
}

/**
 * Legge un ordine PayPal. Usato dalla verifica delle prenotazioni in sospeso,
 * per sapere se il donatore ha approvato il pagamento senza tornare sul sito.
 *
 * Stati rilevanti:
 *   CREATED    → ordine creato, donatore non ha ancora approvato
 *   APPROVED   → approvato dal donatore ma NON catturato: i soldi non sono
 *                ancora stati prelevati, serve la capture
 *   COMPLETED  → già catturato
 *   VOIDED     → annullato
 *
 * `scaduto: true` quando PayPal risponde 404: gli ordini non catturati vengono
 * dismessi dopo qualche ora, ed è una risposta definitiva (niente incasso
 * possibile), quindi il pezzo si può rilasciare.
 */
export async function getPaypalOrder(
  orderId: string
): Promise<{ order: PaypalOrder | null; scaduto: boolean }> {
  const token = await getAccessToken()
  const res = await fetch(`${apiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (res.status === 404) return { order: null, scaduto: true }
  if (!res.ok) {
    throw new Error(`PayPal GET order ${orderId} failed (${res.status}): ${await res.text()}`)
  }
  return { order: (await res.json()) as PaypalOrder, scaduto: false }
}

export interface PaypalCapture {
  status?: string
  purchase_units?: any[]
  message?: string
  [k: string]: unknown
}

/** Cattura un ordine PayPal. `requestId` è la chiave di idempotenza (id booking). */
export async function capturePaypalOrder(
  orderId: string,
  requestId: string
): Promise<PaypalCapture> {
  const token = await getAccessToken()
  const res = await fetch(
    `${apiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': requestId,
      },
      body: '{}',
      cache: 'no-store',
    }
  )
  return (await res.json()) as PaypalCapture
}

/** Importo effettivamente catturato dalla risposta di capture. */
export function capturedAmount(capture: PaypalCapture): number {
  return Number(
    capture?.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ?? 0
  )
}
