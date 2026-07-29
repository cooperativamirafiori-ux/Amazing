/**
 * Verifica presso il provider lo stato reale di una prenotazione rimasta
 * `pending`, e la chiude di conseguenza.
 *
 * PERCHÉ ESISTE — il pezzo viene riservato (`Venduti+1`) quando l'utente
 * *inizia* il pagamento, non quando paga. Se abbandona il checkout (chiude
 * l'app Satispay, non conferma, non torna sul browser) nessuno rilascia la
 * riserva: la prenotazione resta `pending` per sempre tenendo bloccato il pezzo,
 * e a ogni nuovo tentativo dello stesso utente se ne blocca un altro. Era la
 * causa del sintomo "la merce risulta prenotata due volte".
 *
 * REGOLA FONDAMENTALE — **non si annulla mai a tempo.** Può benissimo capitare
 * che il pagamento sia andato a buon fine senza che noi lo sappiamo: l'utente
 * paga su Satispay, chiude l'app e la callback server-to-server non arriva.
 * Annullare alla scadenza libererebbe il pezzo e marcherebbe annullata una
 * donazione già incassata: soldi presi, nessun bene, nessuna ricevuta.
 *
 * Quindi la scadenza fa scattare una **domanda al provider**, e si agisce solo
 * su una risposta definitiva:
 *
 *   Satispay ACCEPTED           → completa (ricevuta + email + archiviazione)
 *   Satispay CANCELED           → rilascia il pezzo e annulla
 *   PayPal   COMPLETED          → completa
 *   PayPal   APPROVED           → il donatore ha approvato ma la capture non è
 *                                 mai avvenuta: si cattura e si completa
 *   PayPal   VOIDED / 404       → rilascia il pezzo e annulla
 *   qualunque altro / errore    → non si tocca nulla, si riprova al giro dopo
 *
 * I **bonifici** non passano da qui: per loro è corretto che la prenotazione
 * resti in sospeso fino alla conferma manuale.
 */
import { aggiornaPrenotazione, annullaERilascia } from '@/lib/lists'
import { getSatispayPayment } from '@/lib/satispay'
import { getPaypalOrder, capturePaypalOrder, capturedAmount } from '@/lib/paypal'
import { completaPagamento } from '@/lib/completa'
import type { Prenotazione } from '@/types'

export type AzioneVerifica = 'completata' | 'rilasciata' | 'attesa' | 'errore' | 'ignorata'

export interface EsitoVerifica {
  spItemId: string
  /** Id logico, più leggibile nei log e nel riepilogo admin. */
  id: string
  metodo: string
  azione: AzioneVerifica
  /** Stato riportato dal provider, quando disponibile. */
  statoProvider?: string
  numeroRicevuta?: string
  /** Spiegazione per il riepilogo admin (motivo del rilascio, errore, ...). */
  dettaglio?: string
}

/** Soglia oltre la quale una pending va verificata (minuti). */
export function sogliaVerificaMinuti(): number {
  const n = Number(process.env.PENDING_VERIFICA_MINUTI)
  return Number.isFinite(n) && n > 0 ? n : 15
}

async function completa(pren: Prenotazione, statoProvider: string): Promise<EsitoVerifica> {
  const done = await completaPagamento(pren.spItemId)
  if ('error' in done) {
    return {
      spItemId: pren.spItemId,
      id: pren.id,
      metodo: pren.metodo,
      azione: 'errore',
      statoProvider,
      dettaglio: done.error,
    }
  }
  return {
    spItemId: pren.spItemId,
    id: pren.id,
    metodo: pren.metodo,
    azione: 'completata',
    statoProvider,
    numeroRicevuta: done.numeroRicevuta,
    dettaglio: done.avvisi?.join(' · '),
  }
}

async function rilascia(
  pren: Prenotazione,
  statoProvider: string,
  motivo: string
): Promise<EsitoVerifica> {
  const res = await annullaERilascia(pren.spItemId)
  return {
    spItemId: pren.spItemId,
    id: pren.id,
    metodo: pren.metodo,
    azione: 'rilasciata',
    statoProvider,
    dettaglio: res.avviso ? `${motivo} — ATTENZIONE: ${res.avviso}` : motivo,
  }
}

async function verificaSatispay(pren: Prenotazione): Promise<EsitoVerifica> {
  if (!pren.satispayPaymentId) {
    // Nessun pagamento associato: la creazione si è interrotta subito dopo la
    // prenotazione, quindi non c'è nulla da incassare e il pezzo va liberato.
    return rilascia(pren, '—', 'Nessun pagamento Satispay associato alla prenotazione')
  }

  const payment = await getSatispayPayment(pren.satispayPaymentId)
  const s = String(payment.status || '').toUpperCase()
  await aggiornaPrenotazione(pren.spItemId, { SatispayStatus: s }).catch(() => {})

  if (s === 'ACCEPTED') return completa(pren, s)
  if (s === 'CANCELED' || s === 'CANCELLED') {
    return rilascia(pren, s, 'Pagamento Satispay annullato o scaduto')
  }
  return {
    spItemId: pren.spItemId,
    id: pren.id,
    metodo: pren.metodo,
    azione: 'attesa',
    statoProvider: s || 'sconosciuto',
    dettaglio: 'Satispay non ha ancora un esito definitivo: si riprova al prossimo giro',
  }
}

async function verificaPaypal(pren: Prenotazione): Promise<EsitoVerifica> {
  if (!pren.paypalOrderId) {
    return rilascia(pren, '—', 'Nessun ordine PayPal associato alla prenotazione')
  }

  const { order, scaduto } = await getPaypalOrder(pren.paypalOrderId)
  if (scaduto || !order) {
    return rilascia(pren, 'EXPIRED', 'Ordine PayPal scaduto: non è più incassabile')
  }

  const s = String(order.status || '').toUpperCase()

  if (s === 'COMPLETED') return completa(pren, s)

  if (s === 'APPROVED') {
    // Il donatore ha approvato l'importo su PayPal ma non è mai tornato sul
    // sito, quindi la capture non è avvenuta e i soldi non sono stati
    // prelevati. `pren.id` come PayPal-Request-Id rende la capture idempotente:
    // se per caso è già avvenuta, PayPal non addebita due volte.
    const capture = await capturePaypalOrder(pren.paypalOrderId, pren.id)
    if (String(capture.status || '').toUpperCase() !== 'COMPLETED') {
      return {
        spItemId: pren.spItemId,
        id: pren.id,
        metodo: pren.metodo,
        azione: 'errore',
        statoProvider: s,
        dettaglio: `Capture non completata: ${capture.status || JSON.stringify(capture).slice(0, 200)}`,
      }
    }
    if (capturedAmount(capture) < Number(pren.importo) - 0.01) {
      return {
        spItemId: pren.spItemId,
        id: pren.id,
        metodo: pren.metodo,
        azione: 'errore',
        statoProvider: s,
        dettaglio: `Importo catturato (${capturedAmount(capture)}) inferiore alla prenotazione (${pren.importo}): verificare a mano`,
      }
    }
    return completa(pren, 'APPROVED→COMPLETED')
  }

  if (s === 'VOIDED') return rilascia(pren, s, 'Ordine PayPal annullato')

  // CREATED, PAYER_ACTION_REQUIRED, ...: il donatore non ha (ancora) approvato.
  // Non si rilascia senza risposta definitiva: l'ordine scadrà da sé e al giro
  // successivo il 404 lo chiuderà.
  return {
    spItemId: pren.spItemId,
    id: pren.id,
    metodo: pren.metodo,
    azione: 'attesa',
    statoProvider: s || 'sconosciuto',
    dettaglio: 'Ordine PayPal non ancora approvato: si riprova al prossimo giro',
  }
}

/** Verifica una singola prenotazione. Non lancia: gli errori diventano esiti. */
export async function verificaPrenotazione(pren: Prenotazione): Promise<EsitoVerifica> {
  const base = { spItemId: pren.spItemId, id: pren.id, metodo: pren.metodo }

  if (pren.stato !== 'pending') {
    return { ...base, azione: 'ignorata', dettaglio: `Stato ${pren.stato}: niente da verificare` }
  }
  if (pren.metodo !== 'paypal' && pren.metodo !== 'satispay') {
    // Bonifico: resta in sospeso fino alla conferma manuale, è corretto così.
    return { ...base, azione: 'ignorata', dettaglio: 'Metodo senza verifica automatica' }
  }

  try {
    return pren.metodo === 'satispay'
      ? await verificaSatispay(pren)
      : await verificaPaypal(pren)
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    console.error('[verifica]', pren.spItemId, msg)
    // Provider non raggiungibile: non si tocca nulla, si riprova al giro dopo.
    return { ...base, azione: 'errore', dettaglio: msg }
  }
}
