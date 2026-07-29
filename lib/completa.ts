/**
 * Completamento di una prenotazione pagata.
 *
 * ORDINE DELLE OPERAZIONI — importante. Prima si scrive `Stato = paid` sulla
 * lista, poi si generano PDF, email e copia su SharePoint. Il contrario (come
 * era fino al 2026-07-29) è pericoloso: quando arriviamo qui i soldi sono già
 * stati incassati (capture PayPal completata, pagamento Satispay ACCEPTED), e
 * se l'invio dell'email fallisce l'eccezione impediva la scrittura dello stato.
 * Risultato: pagamento incassato ma prenotazione ancora `pending`, e l'utente
 * davanti a una pagina d'errore.
 *
 * Ora tutto ciò che viene dopo la scrittura dello stato è **best effort**: gli
 * errori vengono raccolti in `avvisi` e loggati, mai propagati. Il recupero si
 * fa dall'area admin con "Reinvia ricevuta".
 *
 * La transizione a `paid` passa da `marcaPagata()`, che usa un lock ottimistico
 * sull'ETag: su Satispay `finalize` e `callback` arrivano quasi sempre insieme e
 * senza lock genererebbero due ricevute con numeri diversi. Solo chi vince la
 * corsa invia l'email.
 */
import {
  getPrenotazioneBySpId,
  aggiornaPrenotazione,
  prossimoNumeroRicevuta,
  marcaPagata,
} from '@/lib/lists'
import { renderRicevutaPdf, formatDataRicevuta } from '@/lib/ricevuta'
import { inviaRicevutaEmail, inviaEmailRitiro } from '@/lib/email'
import { archiviaRicevuta, archivioAbilitato } from '@/lib/archivio'
import type { Prenotazione } from '@/types'

/**
 * Anno di competenza della ricevuta, letto dal numero (`RIC-2026-AMZ-0001`):
 * una ricevuta del 2026 riemessa nel 2027 resta nella cartella 2026.
 * Fallback: data della prenotazione, poi anno corrente.
 */
export function annoRicevuta(numeroRicevuta: string, data: string): number {
  const m = numeroRicevuta.match(/^RIC-(\d{4})-/)
  if (m) return Number(m[1])
  const d = new Date(data)
  return isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear()
}

/**
 * Data da stampare su un PDF **rigenerato** a posteriori.
 *
 * Limite noto: non memorizziamo la data di emissione della ricevuta, quindi si
 * usa la data della prenotazione. Coincidono per PayPal e Satispay, dove il
 * pagamento è contestuale; per i bonifici confermati a mano giorni dopo no.
 */
export function dataRicevutaDa(pren: Prenotazione): string {
  const d = new Date(pren.data)
  return formatDataRicevuta(isNaN(d.getTime()) ? new Date() : d)
}

export interface EsitoCompletamento {
  numeroRicevuta: string
  /** true se un'altra chiamata aveva già completato il pagamento. */
  giaPagata?: boolean
  /** Problemi non bloccanti (email, PDF, archiviazione) da mostrare all'admin. */
  avvisi?: string[]
}

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
    return { avviso: `Copia su SharePoint non salvata: ${msg}` }
  }
}

/**
 * Genera il PDF, invia le due email e archivia la copia. **Non lancia mai**:
 * ogni problema finisce in `avvisi`.
 *
 * Usato sia dal completamento automatico sia dall'azione admin "Reinvia
 * ricevuta", così i due percorsi non possono divergere.
 */
export async function inviaEArchivia(
  pren: Prenotazione,
  numeroRicevuta: string,
  opts: { anno?: number; dataStr?: string } = {}
): Promise<string[]> {
  const avvisi: string[] = []
  const dataStr = opts.dataStr ?? formatDataRicevuta(new Date())
  const prenDaStampare = { ...pren, numeroRicevuta }

  let pdf: Buffer
  try {
    pdf = await renderRicevutaPdf(prenDaStampare, numeroRicevuta, dataStr)
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    console.error('[completa] generazione PDF fallita:', msg)
    return [`Ricevuta NON generata: ${msg}. Usa "Reinvia ricevuta".`]
  }

  try {
    await inviaRicevutaEmail(prenDaStampare, numeroRicevuta, dataStr, pdf)
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    console.error('[completa] invio ricevuta fallito:', msg)
    avvisi.push(`Email ricevuta NON inviata a ${pren.email}: ${msg}. Usa "Reinvia ricevuta".`)
  }

  // Email informativa sul ritiro: la meno critica delle tre, solo log.
  await inviaEmailRitiro(prenDaStampare).catch((err) =>
    console.error('[completa] invio email ritiro fallito:', err)
  )

  const { pdfUrl, avviso } = await archiviaSenzaBloccare(
    prenDaStampare,
    numeroRicevuta,
    pdf,
    opts.anno
  )
  if (avviso) avvisi.push(avviso)
  if (pdfUrl) {
    await aggiornaPrenotazione(pren.spItemId, { PdfUrl: pdfUrl }).catch((err) =>
      console.error('[completa] scrittura PdfUrl fallita:', err)
    )
  }

  return avvisi
}

export async function completaPagamento(
  spItemId: string
): Promise<EsitoCompletamento | { error: string }> {
  const pren = await getPrenotazioneBySpId(spItemId)
  if (!pren) return { error: 'Prenotazione non trovata' }

  // Percorso rapido: già completata, niente da rifare.
  if (pren.stato === 'paid' && pren.numeroRicevuta) {
    return { numeroRicevuta: pren.numeroRicevuta, giaPagata: true }
  }

  const candidato = pren.numeroRicevuta || (await prossimoNumeroRicevuta())

  // Da qui in poi lo stato è scritto: qualunque errore successivo NON deve
  // rimettere in dubbio un pagamento già incassato.
  const esito = await marcaPagata(spItemId, candidato)
  if (!esito.vinto) {
    // Un'altra chiamata (tipicamente la callback Satispay) ha già preso in
    // carico questo pagamento e sta inviando o ha inviato la ricevuta.
    return { numeroRicevuta: esito.numeroRicevuta, giaPagata: true }
  }

  const avvisi = await inviaEArchivia(pren, esito.numeroRicevuta)
  return {
    numeroRicevuta: esito.numeroRicevuta,
    ...(avvisi.length ? { avvisi } : {}),
  }
}
