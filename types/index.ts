/** Tipi condivisi dell'app Amazing. */
import type { Serie } from '@/lib/serie'
import type { Sezione, ScortaTaglie, Taglia } from '@/lib/natale'
import type { ScortaVarianti, RigaOrdine, RigaRichiesta } from '@/lib/spille'

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
  /**
   * Vetrina in cui compare (colonna SharePoint `Sezione`): AMAZING = catalogo
   * `/`, NATALE = pagina `/natale`. Solo per il canale AMZ. Vedi lib/natale.ts.
   */
  sezione: Sezione
  /**
   * Scorta per taglia (colonna `Taglie`), null se il bene non ha taglie.
   * Se valorizzata, `quantity` = somma delle taglie.
   */
  taglie: ScortaTaglie | null
  /** Pezzi riservati/venduti per taglia (colonna `VendutiTaglie`). */
  vendutiTaglie: ScortaTaglie
  /** Disponibilità residua per taglia (scorta − venduti), {} se senza taglie. */
  disponibiliTaglie: ScortaTaglie
  /**
   * Scorta per variante soggetto|misura (colonna `Varianti`, spille di Natale),
   * null se il bene non è a varianti. Se valorizzata, `quantity` = somma.
   */
  varianti: ScortaVarianti | null
  /** Pezzi riservati/venduti per variante (colonna `VendutiVarianti`). */
  vendutiVarianti: ScortaVarianti
  /** Disponibilità residua per variante, {} se il bene non è a varianti. */
  disponibiliVarianti: ScortaVarianti
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
  /** Taglia scelta (prodotti Natale con taglie), vuota per gli altri beni. */
  taglia: string
  /** Pezzi dello stesso prodotto in questa prenotazione (1 per i beni classici). */
  pezzi: number
  /** Righe dell'ordine per i beni a varianti (spille), [] per gli altri. */
  righe: RigaOrdine[]
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
  /**
   * true se il bene è della vetrina Natale (o la riga ha taglia/pezzi).
   * Calcolato dall'API admin, non salvato su SharePoint.
   */
  natale?: boolean
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
  /** Solo sezione Natale: taglia scelta (obbligatoria se il prodotto ha taglie). */
  taglia?: Taglia
  /** Solo sezione Natale: numero di pezzi (default 1). */
  pezzi?: number
  /** Solo beni a varianti (spille): quante per soggetto|misura. */
  righe?: RigaRichiesta[]
}
