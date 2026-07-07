import { NextRequest, NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/api-guard'
import { cambiaStato, eliminaPrenotazione, getPrenotazioneBySpId } from '@/lib/lists'
import { completaPagamento } from '@/lib/completa'
import type { StatoPagamento } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATI: StatoPagamento[] = ['pending', 'paid', 'annullato', 'consegnato']

/**
 * PATCH: cambia stato. Se il nuovo stato è "paid", genera ricevuta + invia
 * email (completaPagamento), come faceva setBookingStatus nel backend GAS.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ spItemId: string }> }
) {
  const g = await guardAdmin()
  if (g.error) return g.error
  try {
    const { spItemId } = await params
    const { stato } = (await req.json()) as { stato: StatoPagamento }
    if (!STATI.includes(stato)) {
      return NextResponse.json({ error: 'Stato non valido' }, { status: 400 })
    }

    if (stato === 'paid') {
      const pren = await getPrenotazioneBySpId(spItemId)
      if (!pren) return NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 })
      const res = await completaPagamento(spItemId)
      if ('error' in res) return NextResponse.json({ error: res.error }, { status: 500 })
      return NextResponse.json({ ok: true, numeroRicevuta: res.numeroRicevuta })
    }

    const res = await cambiaStato(spItemId, stato)
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: 400 })
    return NextResponse.json({ ok: true, prenotazione: res })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Errore' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ spItemId: string }> }
) {
  const g = await guardAdmin()
  if (g.error) return g.error
  try {
    const { spItemId } = await params
    await eliminaPrenotazione(spItemId)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Errore' }, { status: 500 })
  }
}
