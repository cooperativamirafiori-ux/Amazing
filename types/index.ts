/** Tipi condivisi dell'app Amazing. */

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
  /** Disponibilità residua = quantity - venduti (mai < 0) */
  available: number
}

export type StatoPagamento = 'pending' | 'paid' | 'annullato' | 'consegnato'

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
  pdfUrl: string
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
}
