import { NextRequest, NextResponse } from 'next/server'
import { creaPrenotazione, aggiornaPrenotazione, annullaERilascia } from '@/lib/lists'
import { createSatispayPayment } from '@/lib/satispay'
import { validaPrenotazione } from '@/lib/valida-prenotazione'
import { appBaseUrl } from '@/lib/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Avvia un pagamento Satispay: crea la prenotazione (riservando il bene),
 * crea il pagamento Satispay e ritorna il redirect_url verso cui mandare
 * l'utente. In caso di errore rilascia il bene riservato.
 */
export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const v = validaPrenotazione(body, 'satispay')
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const res = await creaPrenotazione(v.data)
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: 400 })
  const pren = res.prenotazione

  try {
    const base = appBaseUrl()
    const payment = await createSatispayPayment({
      importo: pren.importo,
      externalCode: pren.id,
      // Satispay sostituisce {uuid} con l'id del pagamento nella callback S2S
      callbackUrl: `${base}/api/pagamenti/satispay/callback?payment_id={uuid}`,
      redirectUrl: `${base}/pagamento?satispay_booking=${encodeURIComponent(pren.spItemId)}`,
      bookingId: pren.spItemId,
      email: pren.email,
    })

    await aggiornaPrenotazione(pren.spItemId, {
      SatispayPaymentId: payment.id || '',
      SatispayStatus: payment.status || 'PENDING',
    })

    return NextResponse.json({
      prenotazione: pren,
      redirect_url: payment.redirect_url,
      satispay_payment_id: payment.id || '',
    })
  } catch (err: any) {
    console.error('[satispay/start]', err)
    // Prenotazione orfana: nessun pagamento associato → rilascia il bene
    await annullaERilascia(pren.spItemId).catch(() => {})
    return NextResponse.json({ error: err?.message ?? 'Errore Satispay' }, { status: 502 })
  }
}
