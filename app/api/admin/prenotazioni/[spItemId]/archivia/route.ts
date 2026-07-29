/**
 * Riarchiviazione manuale di una ricevuta già emessa: rigenera il PDF e ne
 * salva (o sovrascrive) la copia nella cartella SharePoint dell'anno della
 * ricevuta, poi aggiorna PdfUrl sulla prenotazione.
 *
 * Serve per le ricevute emesse prima dell'introduzione dell'archiviazione
 * automatica e per recuperare i casi in cui l'upload era fallito.
 *
 * A differenza di completaPagamento qui l'errore **non** viene inghiottito:
 * l'operatore ha chiesto esplicitamente l'archiviazione, quindi deve vedere se
 * non è andata a buon fine.
 */
import { NextRequest, NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/api-guard'
import { getPrenotazioneBySpId, aggiornaPrenotazione } from '@/lib/lists'
import { renderRicevutaPdf } from '@/lib/ricevuta'
import { archiviaRicevuta, archivioAbilitato } from '@/lib/archivio'
import { annoRicevuta, dataRicevutaDa } from '@/lib/completa'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ spItemId: string }> }
) {
  const g = await guardAdmin()
  if (g.error) return g.error
  try {
    if (!archivioAbilitato()) {
      return NextResponse.json(
        {
          error:
            'Archiviazione su SharePoint non configurata (manca SP_RICEVUTE_DRIVE_ID o SP_RICEVUTE_SITE).',
        },
        { status: 400 }
      )
    }

    const { spItemId } = await params
    const pren = await getPrenotazioneBySpId(spItemId)
    if (!pren) return NextResponse.json({ error: 'Prenotazione non trovata' }, { status: 404 })
    if (!pren.numeroRicevuta) {
      return NextResponse.json(
        { error: 'Nessuna ricevuta emessa per questa prenotazione' },
        { status: 400 }
      )
    }
    // Le prenotazioni importate dalla vecchia app hanno un numero ricevuta anche
    // da `pending`: archiviare il PDF di una donazione non ancora incassata
    // metterebbe una ricevuta fiscale non dovuta nella cartella della Segreteria.
    if (pren.stato !== 'paid') {
      return NextResponse.json(
        { error: 'La prenotazione non è pagata: conferma prima il pagamento.' },
        { status: 400 }
      )
    }

    // Il PDF viene rigenerato (vedi dataRicevutaDa per il limite sulla data).
    const pdf = await renderRicevutaPdf(pren, pren.numeroRicevuta, dataRicevutaDa(pren))

    const res = await archiviaRicevuta({
      pdf,
      numeroRicevuta: pren.numeroRicevuta,
      nominativo: `${pren.nome} ${pren.cognome}`.trim(),
      anno: annoRicevuta(pren.numeroRicevuta, pren.data),
    })

    if (res.webUrl) await aggiornaPrenotazione(spItemId, { PdfUrl: res.webUrl })

    return NextResponse.json({ ok: true, ...res })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Errore' }, { status: 500 })
  }
}
