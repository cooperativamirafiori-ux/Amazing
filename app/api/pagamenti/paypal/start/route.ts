import { NextRequest, NextResponse } from 'next/server'
import { creaPrenotazione, aggiornaPrenotazione, annullaERilascia } from '@/lib/lists'
import { createPaypalOrder } from '@/lib/paypal'
import { validaPrenotazione } from '@/lib/valida-prenotazione'
import { appBaseUrl } from '@/lib/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Avvia un checkout PayPal: crea la prenotazione (riservando il bene), crea
 * l'ordine PayPal (intent CAPTURE) e ritorna il link "approve".
 */
export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const v = validaPrenotazione(body, 'paypal')
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const res = await creaPrenotazione(v.data)
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: 400 })
  const pren = res.prenotazione

  try {
    const base = appBaseUrl()
    const order = await createPaypalOrder({
      importo: pren.importo,
      descrizione: `Donazione Progetto Amazing - ${pren.goodName}`,
      bookingId: pren.spItemId,
      returnUrl: `${base}/pagamento?paypal_confirm=${encodeURIComponent(pren.spItemId)}`,
      cancelUrl: `${base}/pagamento?paypal_cancel=${encodeURIComponent(pren.spItemId)}`,
    })

    if (!order.id) {
      await annullaERilascia(pren.spItemId).catch(() => {})
      return NextResponse.json(
        { error: 'Errore creazione ordine PayPal: ' + (order.message || JSON.stringify(order)) },
        { status: 502 }
      )
    }

    await aggiornaPrenotazione(pren.spItemId, { PaypalOrderId: order.id })

    const approve = (order.links || []).find((l) => l.rel === 'approve')
    return NextResponse.json({
      prenotazione: pren,
      redirect_url: approve ? approve.href : null,
    })
  } catch (err: any) {
    console.error('[paypal/start]', err)
    await annullaERilascia(pren.spItemId).catch(() => {})
    return NextResponse.json({ error: err?.message ?? 'Errore PayPal' }, { status: 502 })
  }
}
