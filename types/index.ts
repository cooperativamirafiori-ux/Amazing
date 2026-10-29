/** Tipi condivisi dell'app Amazing. */
import type { Serie } from '@/lib/serie'

export interface Bene {
  /** ID item SharePoint (stringa) */
  spItemId: string
  /** ID logico (timestamp ms, compatibile con lo storico) */
  id: string
  name: string
  description: string
  price: number
  quantity: number
  venduti: number
  image: string
  flexibleAmount: boolean
  /**
   * Canale/serie ricevute (colonna SharePoint `Canale`): AMZ = catalogo Amazing,
   * MIR = progetto della pagina /dona. Vedi lib/serie.ts.
   */
  canale: Serie
  /** Disponibilità residua = quantity - venduti (mai < 0) */
  available: number
}

/** Riguarda esclusivamente il pagamento (non la consegna del bene). */
export type StatoPagamento = 'pending' | 'paid' | 'annullato'

export type MetodoPagamento = 'paypal' | 'satispay' | 'bonifico'

export interface Prenotazione {
  spItemId: string
  id: string
  numeroRicevuta: string
  goodId: string
  goodName: string
  nome: string
  cognome: string
  indirizzo: string
  codiceFiscale: string
  email: string
  importo: number
  data: string
  metodo: MetodoPagamento | string
  stato: StatoPagamento
  /** Consegna del bene: indipendente dallo stato di pagamento, gestita a mano dall'operatore. */
  consegnato: boolean
  pdfUrl: string
  /** ID pagamento Satispay (Business API) — valorizzato per metodo satispay */
  satispayPaymentId: string
  /** Ultimo stato Satispay noto: PENDING | ACCEPTED | CANCELED */
  satispayStatus: string
  /** ID ordine PayPal (Orders API v2) — valorizzato per metodo paypal */
  paypalOrderId: string
  /**
   * true se il bene e' a importo libero ("Donazione Libera"): niente da
   * consegnare. Calcolato dall'API admin incrociando il catalogo, non salvato
   * su SharePoint.
   */
  donazioneLibera?: boolean
  /**
   * Serie della donazione (AMZ / MIR). Calcolata dall'API admin dal numero
   * ricevuta o, se manca, dal canale del bene. Non salvata su SharePoint.
   */
  serie?: Serie
}

/** Payload di creazione prenotazione dal checkout pubblico. */
export interface NuovaPrenotazione {
  goodId: string
  nome: string
  cognome: string
  indirizzo: string
  codiceFiscale: string
  email: string
  importo: number
  metodo: MetodoPagamento
  /**
   * Solo pagina /dona: 'giuridica' = ente/azienda (nome = ragione sociale,
   * cognome vuoto, codice = P.IVA o C.F. ente). Vedi lib/donatore.ts.
   */
  tipoDonatore?: 'fisica' | 'giuridica'
}
