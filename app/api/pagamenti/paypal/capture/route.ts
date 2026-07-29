import { NextRequest, NextResponse } from 'next/server'
import { getPrenotazioneBySpId } from '@/lib/lists'
import { capturePaypalOrder, capturedAmount } from '@/lib/paypal'
import { completaPagamento } from '@/lib/completa'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Cattura l'ordine PayPal al ritorno dell'utente. Verifica lo stato COMPLETED
 * e la coerenza dell'importo, poi completa (ricevuta + email). Idempotente.
 */
export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const spItemId = String(body?.spItemId ?? '').trim()
  const orderId = String(body?.orderId ?? '').trim()
  if (!spItemId) return NextResponse.json({ error: 'spItemId mancante' }, { status: 400 })
  if (!orderId) return NextResponse.json({ error: 'PayPal order ID mancante' }, { status: 400 })

  const pren = await getPrenotazioneBySpId(spItemId)
  if (!pren) return NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 })
  if (pren.stato === 'paid') {
    return NextResponse.json({
      status: 'paid',
      numeroRicevuta: pren.numeroRicevuta,
      already_paid: true,
    })
  }

  try {
    const capture = await capturePaypalOrder(orderId, pren.id)
    if (capture.status !== 'COMPLETED') {
      return NextResponse.json({ status: 'pending', message: 'Pagamento non ancora completato.' })
    }
    if (capturedAmount(capture) < Number(pren.importo) - 0.01) {
      return NextResponse.json(
        { error: 'Importo catturato inferiore alla prenotazione.' },
        { status: 400 }
      )
    }

    const done = await completaPagamento(spItemId)
    if ('error' in done) return NextResponse.json({ error: done.error }, { status: 500 })
    return NextResponse.json({ status: 'paid', numeroRicevuta: done.numeroRicevuta })
  } catch (err: any) {
    console.error('[paypal/capture]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore PayPal' }, { status: 502 })
  }
}
