import { NextRequest, NextResponse } from 'next/server'
import {
  getPrenotazioneBySpId,
  aggiornaPrenotazione,
  annullaERilascia,
} from '@/lib/lists'
import { getSatispayPayment } from '@/lib/satispay'
import { completaPagamento } from '@/lib/completa'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Finalizza al ritorno dell'utente dalla pagina Satispay: rilegge lo stato del
 * pagamento e, se ACCEPTED, completa (ricevuta + email). Se CANCELED rilascia
 * il bene. Idempotente (la callback S2S può aver già completato).
 */
export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const spItemId = String(body?.spItemId ?? '').trim()
  if (!spItemId) return NextResponse.json({ error: 'spItemId mancante' }, { status: 400 })

  const pren = await getPrenotazioneBySpId(spItemId)
  if (!pren) return NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 })
  if (!pren.satispayPaymentId) {
    return NextResponse.json({ error: 'Pagamento Satispay non associato' }, { status: 400 })
  }
  if (pren.stato === 'paid') {
    return NextResponse.json({
      status: 'paid',
      numeroRicevuta: pren.numeroRicevuta,
      already_paid: true,
    })
  }

  try {
    const payment = await getSatispayPayment(pren.satispayPaymentId)
    const s = String(payment.status || '')
    await aggiornaPrenotazione(spItemId, { SatispayStatus: s })

    if (s === 'ACCEPTED') {
      const done = await completaPagamento(spItemId)
      if ('error' in done) return NextResponse.json({ error: done.error }, { status: 500 })
      return NextResponse.json({ status: 'paid', numeroRicevuta: done.numeroRicevuta })
    }
    if (s === 'CANCELED' || s === 'CANCELLED') {
      await annullaERilascia(spItemId).catch(() => {})
      return NextResponse.json({ status: 'canceled' })
    }
    return NextResponse.json({ status: 'pending', satispay_status: s })
  } catch (err: any) {
    console.error('[satispay/finalize]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore Satispay' }, { status: 502 })
  }
}
