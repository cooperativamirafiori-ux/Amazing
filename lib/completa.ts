/**
 * Completamento di una prenotazione pagata: assegna il numero ricevuta (se
 * mancante), genera il PDF, invia l'email al donatore, archivia una copia del
 * PDF su SharePoint e aggiorna lo stato.
 *
 * L'archiviazione (vedi lib/archivio.ts) è **non bloccante**: quando ci si
 * arriva, la ricevuta è già partita per email e il pagamento è già stato
 * incassato, quindi un errore di SharePoint non deve far risultare la
 * prenotazione come non pagata. L'errore finisce nei log e viene restituito al
 * chiamante in `avvisoArchivio`, così l'area admin può segnalarlo.
 */
import {
  getPrenotazioneBySpId,
  aggiornaPrenotazione,
  prossimoNumeroRicevuta,
} from '@/lib/lists'
import { renderRicevutaPdf, formatDataRicevuta } from '@/lib/ricevuta'
import { inviaRicevutaEmail, inviaEmailRitiro } from '@/lib/email'
import { archiviaRicevuta, archivioAbilitato } from '@/lib/archivio'
import type { Prenotazione } from '@/types'

/**
 * Archivia il PDF senza mai lanciare: ritorna l'URL del file oppure il
 * messaggio d'errore da mostrare all'operatore.
 */
export async function archiviaSenzaBloccare(
  p: Prenotazione,
  numeroRicevuta: string,
  pdf: Buffer,
  anno?: number
): Promise<{ pdfUrl?: string; avviso?: string }> {
  if (!archivioAbilitato()) return {}
  try {
    const res = await archiviaRicevuta({
      pdf,
      numeroRicevuta,
      nominativo: `${p.nome} ${p.cognome}`.trim(),
      anno,
    })
    return { pdfUrl: res.webUrl }
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    console.error('[archivio] salvataggio ricevuta su SharePoint fallito:', msg)
    return { avviso: `Ricevuta inviata, ma copia su SharePoint non salvata: ${msg}` }
  }
}

export async function completaPagamento(
  spItemId: string
): Promise<{ numeroRicevuta: string; avvisoArchivio?: string } | { error: string }> {
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

  const { pdfUrl, avviso } = await archiviaSenzaBloccare(prenDaStampare, numeroRicevuta, pdf)

  await aggiornaPrenotazione(spItemId, {
    Stato: 'paid',
    NumeroRicevuta: numeroRicevuta,
    ...(pdfUrl ? { PdfUrl: pdfUrl } : {}),
  })
  return { numeroRicevuta, ...(avviso ? { avvisoArchivio: avviso } : {}) }
}
