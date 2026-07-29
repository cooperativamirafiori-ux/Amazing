/**
 * Reinvio manuale della ricevuta: rigenera il PDF, lo invia al donatore e
 * salva la copia su SharePoint.
 *
 * È il recupero per i casi in cui il pagamento è andato a buon fine ma l'invio
 * dell'email è fallito. Dal 2026-07-29 lo stato `paid` viene scritto **prima**
 * di email e PDF, quindi un problema di posta non lascia più il pagamento in
 * sospeso: lascia solo il donatore senza ricevuta, e questa route lo risolve.
 *
 * Riusa `inviaEArchivia()`, la stessa funzione del completamento automatico,
 * così i due percorsi non possono divergere.
 */
import { NextRequest, NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/api-guard'
import {
  getPrenotazioneBySpId,
  aggiornaPrenotazione,
  prossimoNumeroRicevuta,
} from '@/lib/lists'
import { inviaEArchivia, annoRicevuta, dataRicevutaDa } from '@/lib/completa'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ spItemId: string }> }
) {
  const g = await guardAdmin()
  if (g.error) return g.error
  try {
    const { spItemId } = await params
    const pren = await getPrenotazioneBySpId(spItemId)
    if (!pren) return NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 })
    if (pren.stato !== 'paid') {
      return NextResponse.json(
        { error: 'La prenotazione non è pagata: conferma prima il pagamento.' },
        { status: 400 }
      )
    }

    // Caso di recupero: pagata ma senza numero (interruzione a metà prima del
    // fix del 2026-07-29). Se ne assegna uno adesso.
    let numeroRicevuta = pren.numeroRicevuta
    if (!numeroRicevuta) {
      numeroRicevuta = await prossimoNumeroRicevuta()
      await aggiornaPrenotazione(spItemId, { NumeroRicevuta: numeroRicevuta })
    }

    const avvisi = await inviaEArchivia(pren, numeroRicevuta, {
      anno: annoRicevuta(numeroRicevuta, pren.data),
      dataStr: dataRicevutaDa(pren),
    })

    if (avvisi.length) {
      // Reinvio esplicito: l'operatore deve vedere se non è andato a buon fine.
      return NextResponse.json({ error: avvisi.join(' · '), numeroRicevuta }, { status: 502 })
    }
    return NextResponse.json({ ok: true, numeroRicevuta, email: pren.email })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Errore' }, { status: 500 })
  }
}
