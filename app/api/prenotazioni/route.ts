import { NextRequest, NextResponse } from 'next/server'
import { creaPrenotazione } from '@/lib/lists'
import { validaPrenotazione } from '@/lib/valida-prenotazione'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST pubblico: crea una prenotazione con pagamento tramite bonifico. */
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  // Stessa validazione di PayPal/Satispay (persona fisica o giuridica).
  const v = validaPrenotazione(body, 'bonifico')
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  try {
    const res = await creaPrenotazione(v.data)
    if ('error' in res) {
      return NextResponse.json({ error: res.error }, { status: 400 })
    }
    return NextResponse.json({ prenotazione: res.prenotazione }, { status: 201 })
  } catch (err: any) {
    console.error('[POST /api/prenotazioni]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore interno' }, { status: 500 })
  }
}
