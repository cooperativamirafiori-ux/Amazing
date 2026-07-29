import { NextRequest, NextResponse } from 'next/server'
import {
  getPrenotazioneBySatispayPaymentId,
  aggiornaPrenotazione,
  annullaERilascia,
} from '@/lib/lists'
import { getSatispayPayment } from '@/lib/satispay'
import { completaPagamento } from '@/lib/completa'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Callback server-to-server di Satispay. Riceve l'id del pagamento (query
 * `payment_id` sostituito da Satispay, oppure nel body), rilegge lo stato e
 * completa/annulla la prenotazione. Idempotente.
 */
async function handle(paymentId: string): Promise<Response> {
  if (!paymentId) return NextResponse.json({ ignored: true })

  const pren = await getPrenotazioneBySatispayPaymentId(paymentId)
  if (!pren) return NextResponse.json({ ignored: true })

  try {
    const payment = await getSatispayPayment(paymentId)
    const s = String(payment.status || '')
    await aggiornaPrenotazione(pren.spItemId, { SatispayStatus: s })

    if (s === 'ACCEPTED' && pren.stato !== 'paid') {
      await completaPagamento(pren.spItemId)
    } else if ((s === 'CANCELED' || s === 'CANCELLED') && pren.stato !== 'paid') {
      await annullaERilascia(pren.spItemId).catch(() => {})
    }
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[satispay/callback]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore' }, { status: 500 })
  }
}

function extractId(req: NextRequest, body: any): string {
  const q = req.nextUrl.searchParams
  return String(
    q.get('payment_id') || q.get('id') || body?.id || body?.payment_id || ''
  ).trim()
}

export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    /* body vuoto/non-JSON è ammesso */
  }
  return handle(extractId(req, body))
}

export async function GET(req: NextRequest) {
  return handle(extractId(req, {}))
}
