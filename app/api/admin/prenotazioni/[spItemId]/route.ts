import { NextRequest, NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/api-guard'
import { cambiaConsegna, cambiaStato, eliminaPrenotazione, getPrenotazioneBySpId } from '@/lib/lists'
import { completaPagamento } from '@/lib/completa'
import type { StatoPagamento } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Solo stato pagamento: "consegnato" non è più un valore di Stato, è la
// colonna indipendente Consegnato (vedi ramo `consegnato` più sotto).
const STATI: StatoPagamento[] = ['pending', 'paid', 'annullato']

/**
 * PATCH: due campi indipendenti nel body.
 * - `stato`: cambia lo stato pagamento. Se il nuovo stato è "paid", genera
 *   ricevuta + invia email (completaPagamento), come faceva setBookingStatus
 *   nel backend GAS. Uso tipico: conferma manuale di un bonifico (paypal e
 *   satispay si aggiornano già da soli via callback/finalize).
 * - `consegnato`: flag booleano per la consegna del bene, indipendente dal
 *   pagamento e impostato a mano dall'operatore.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ spItemId: string }> }
) {
  const g = await guardAdmin()
  if (g.error) return g.error
  try {
    const { spItemId } = await params
    const body = (await req.json()) as { stato?: StatoPagamento; consegnato?: boolean }

    if (typeof body.consegnato === 'boolean') {
      const res = await cambiaConsegna(spItemId, body.consegnato)
      if ('error' in res) return NextResponse.json({ error: res.error }, { status: 400 })
      return NextResponse.json({ ok: true, prenotazione: res })
    }

    const stato = body.stato
    if (!stato || !STATI.includes(stato)) {
      return NextResponse.json({ error: 'Stato non valido' }, { status: 400 })
    }

    if (stato === 'paid') {
      const pren = await getPrenotazioneBySpId(spItemId)
      if (!pren) return NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 })
      const res = await completaPagamento(spItemId)
      if ('error' in res) return NextResponse.json({ error: res.error }, { status: 500 })
      return NextResponse.json({
        ok: true,
        numeroRicevuta: res.numeroRicevuta,
        giaPagata: res.giaPagata,
        avvisi: res.avvisi,
      })
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
