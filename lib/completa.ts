/**
 * Completamento di una prenotazione pagata: assegna il numero ricevuta (se
 * mancante), genera il PDF, invia l'email al donatore e aggiorna lo stato.
 *
 * In v1 il PDF viene inviato via email ma non archiviato (PdfUrl resta vuoto).
 * L'archiviazione su SharePoint/OneDrive è un'estensione prevista dal piano.
 */
import {
  getPrenotazioneBySpId,
  aggiornaPrenotazione,
  prossimoNumeroRicevuta,
} from '@/lib/lists'
import { renderRicevutaPdf, formatDataRicevuta } from '@/lib/ricevuta'
import { inviaRicevutaEmail, inviaEmailRitiro } from '@/lib/email'

export async function completaPagamento(
  spItemId: string
): Promise<{ numeroRicevuta: string } | { error: string }> {
  const pren = await getPrenotazioneBySpId(spItemId)
  if (!pren) return { error: 'Prenotazione non trovata' }
  if (pren.stato === 'paid' && pren.numeroRicevuta) {
    return { numeroRicevuta: pren.numeroRicevuta }
  }

  const numeroRicevuta = pren.numeroRicevuta || (await prossimoNumeroRicevuta())
  const dataStr = formatDataRicevuta(new Date())

  const prenDaStampare = { ...pren, numeroRicevuta }
  const pdf = await renderRicevutaPdf(prenDaStampare, numeroRicevuta, dataStr)
  await inviaRicevutaEmail(prenDaStampare, numeroRicevuta, dataStr, pdf)
  // Email informativa sul ritiro: non deve bloccare il completamento del
  // pagamento se per qualche motivo fallisce (la ricevuta è già stata inviata).
  await inviaEmailRitiro(prenDaStampare).catch((err) =>
    console.error('[completaPagamento] invio email ritiro fallito:', err)
  )

  await aggiornaPrenotazione(spItemId, { Stato: 'paid', NumeroRicevuta: numeroRicevuta })
  return { numeroRicevuta }
}
