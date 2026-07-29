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
import { renderRicevutaPdf, formatDataRicevuta } from '@/lib/ricevuta'
import { archiviaRicevuta, archivioAbilitato } from '@/lib/archivio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Anno di competenza della ricevuta: si legge dal numero (`RIC-2026-AMZ-0001`),
 * così una ricevuta del 2026 riarchiviata nel 2027 resta nella cartella 2026.
 * Fallback: data della prenotazione, poi anno corrente.
 */
function annoRicevuta(numeroRicevuta: string, data: string): number {
  const m = numeroRicevuta.match(/^RIC-(\d{4})-/)
  if (m) return Number(m[1])
  const d = new Date(data)
  return isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear()
}

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

    // Il PDF viene rigenerato: la data mostrata è quella della prenotazione
    // (l'unica disponibile a posteriori, coincide con la data pagamento per
    // PayPal e Satispay; per i bonifici confermati a mano può differire).
    const d = new Date(pren.data)
    const dataStr = formatDataRicevuta(isNaN(d.getTime()) ? new Date() : d)
    const pdf = await renderRicevutaPdf(pren, pren.numeroRicevuta, dataStr)

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
