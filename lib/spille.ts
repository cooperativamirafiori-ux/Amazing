/**
 * Spille della vetrina "Natale 2026": un solo prodotto con più varianti
 * (soggetto × misura) che il donatore compone in un unico ordine.
 *
 * Non è un carrello: si resta su un solo prodotto, una sola pagina, una sola
 * prenotazione e una sola ricevuta AMZ. Nel checkout c'è una griglia con una
 * riga per soggetto e un contatore per ogni misura; la donazione è la somma
 * di prezzo della misura × pezzi.
 *
 * Dati su SharePoint:
 *   - Beni.Varianti         (testo JSON) scorta per variante, es. {"VOLPINA|P":30}
 *   - Beni.VendutiVarianti  (testo JSON) pezzi riservati/venduti per variante
 *   - Prenotazioni.Righe    (testo JSON) righe dell'ordine (vedi RigaOrdine)
 *   - Prenotazioni.Pezzi    totale dei pezzi dell'ordine
 * Un bene è "a varianti" se la colonna Varianti è valorizzata. Per questi beni
 * `Quantita` e `Venduti` sono tenuti allineati alle somme, come per le taglie.
 *
 * Soggetti, misure e prezzi stanno qui nel codice (catalogo Natale 2026,
 * pagine "spille" del catalogo cartaceo). Le scorte invece stanno su
 * SharePoint e si modificano dall'admin.
 *
 * Nessuna env, nessuna dipendenza server: importabile anche dai componenti client.
 */

export interface MisuraSpilla {
  codice: string
  nome: string
  /** Donazione per una spilla di questa misura (€). */
  prezzo: number
}

export interface SoggettoSpilla {
  codice: string
  nome: string
  immagine: string
}

export const MISURE_SPILLE: MisuraSpilla[] = [
  { codice: 'P', nome: 'Piccola', prezzo: 2 },
  { codice: 'M', nome: 'Media', prezzo: 3 },
  { codice: 'G', nome: 'Grande', prezzo: 4 },
]

const img = (f: string) => `/natale/spille/${f}.jpg`

export const SOGGETTI_SPILLE: SoggettoSpilla[] = [
  { codice: 'MA-CIAO', nome: 'Ma ciao!', immagine: img('ma-ciao') },
  { codice: 'PAPPAGALLO', nome: 'Pappagallo', immagine: img('pappagallo') },
  { codice: 'TOILETTE-KING', nome: 'Toilette King', immagine: img('toilette-king') },
  { codice: 'SCHIENA', nome: 'Schiena', immagine: img('schiena') },
  { codice: 'SPLASH', nome: 'Splash', immagine: img('splash') },
  { codice: 'VOLPINA', nome: 'Volpina', immagine: img('volpina') },
  { codice: 'PESCE-SQUALO', nome: 'Pesce squalo', immagine: img('pesce-squalo') },
  { codice: 'DRAGHETTO', nome: 'Draghetto innamorato', immagine: img('draghetto-innamorato') },
  { codice: 'TI-PENSO', nome: 'Ti penso', immagine: img('ti-penso') },
  { codice: 'LIMONI', nome: 'Limoni', immagine: img('limoni') },
  { codice: 'OCA-REALE', nome: 'Oca reale', immagine: img('oca-reale') },
  { codice: 'TUFFO-DOLCE', nome: 'Tuffo dolce', immagine: img('tuffo-dolce') },
]

export const SPILLE = {
  /** Scorta iniziale di ogni variante (soggetto × misura). */
  scortaIniziale: 30,
  /** Massimo di spille in un singolo ordine. */
  maxPezzi: 200,
  autrici: 'Griselda Desclos e Stefania Lapone',
  copertina: img('copertina'),
}

/** Scorta (o venduti) per variante, chiave "SOGGETTO|MISURA". */
export type ScortaVarianti = Record<string, number>

export const chiaveVariante = (soggetto: string, misura: string) => `${soggetto}|${misura}`

/** Soggetto e misura di una chiave, null se non è una variante del catalogo. */
export function infoVariante(
  chiave: string
): { soggetto: SoggettoSpilla; misura: MisuraSpilla } | null {
  const [s, m] = String(chiave).split('|')
  const soggetto = SOGGETTI_SPILLE.find((x) => x.codice === s)
  const misura = MISURE_SPILLE.find((x) => x.codice === m)
  return soggetto && misura ? { soggetto, misura } : null
}

/** Scorta piena di tutte le varianti del catalogo (per creare il prodotto). */
export function scortaInizialeVarianti(n = SPILLE.scortaIniziale): ScortaVarianti {
  const out: ScortaVarianti = {}
  for (const s of SOGGETTI_SPILLE) for (const m of MISURE_SPILLE) out[chiaveVariante(s.codice, m.codice)] = n
  return out
}

/**
 * Legge una colonna JSON di varianti. Tiene solo le chiavi del catalogo con
 * valori interi ≥ 0. Ritorna null se non c'è nessuna variante.
 */
export function leggiVarianti(raw: unknown): ScortaVarianti | null {
  if (raw == null || raw === '') return null
  let obj: any = raw
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const out: ScortaVarianti = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === '' || !infoVariante(k)) continue
    const n = Number(v)
    if (Number.isInteger(n) && n >= 0) out[k] = n
  }
  return Object.keys(out).length ? out : null
}

/** Serializza per la colonna SharePoint (stringa vuota = nessuna variante). */
export function scriviVarianti(v: ScortaVarianti | null | undefined): string {
  if (!v || !Object.keys(v).length) return ''
  return JSON.stringify(v)
}

export function sommaVarianti(v: ScortaVarianti | null | undefined): number {
  if (!v) return 0
  return Object.values(v).reduce((s, n) => s + (Number(n) || 0), 0)
}

/** Riga di un ordine a varianti, salvata nella prenotazione (colonna Righe). */
export interface RigaOrdine {
  chiave: string
  /** Nome del soggetto e della misura al momento dell'ordine (per lo storico). */
  soggetto: string
  misura: string
  pezzi: number
  /** Donazione per pezzo al momento dell'ordine. */
  prezzo: number
}

/** Richiesta del checkout: quante spille per variante. */
export interface RigaRichiesta {
  chiave: string
  pezzi: number
}

/**
 * Ripulisce le righe richieste: scarta chiavi sconosciute e quantità ≤ 0,
 * somma le righe con la stessa chiave. Ritorna null se qualcosa non è valido.
 */
export function normalizzaRighe(raw: unknown): RigaRichiesta[] | null {
  if (!Array.isArray(raw)) return null
  const tot = new Map<string, number>()
  for (const r of raw) {
    const chiave = String(r?.chiave ?? '')
    const pezzi = Number(r?.pezzi)
    if (!infoVariante(chiave) || !Number.isInteger(pezzi) || pezzi < 0) return null
    if (pezzi === 0) continue
    tot.set(chiave, (tot.get(chiave) ?? 0) + pezzi)
  }
  return [...tot].map(([chiave, pezzi]) => ({ chiave, pezzi }))
}

/** Righe complete (nomi e prezzi) a partire dalla richiesta. */
export function componiRighe(richiesta: RigaRichiesta[]): RigaOrdine[] {
  return richiesta.map(({ chiave, pezzi }) => {
    const info = infoVariante(chiave)!
    return {
      chiave,
      soggetto: info.soggetto.nome,
      misura: info.misura.nome,
      pezzi,
      prezzo: info.misura.prezzo,
    }
  })
}

export function totaleRighe(righe: { pezzi: number; prezzo: number }[]): number {
  return Math.round(righe.reduce((s, r) => s + r.pezzi * r.prezzo, 0) * 100) / 100
}

/** Legge la colonna Righe di una prenotazione ([] se vuota o non valida). */
export function leggiRighe(raw: unknown): RigaOrdine[] {
  if (raw == null || raw === '') return []
  let arr: any = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
  return arr
    .map((r) => ({
      chiave: String(r?.chiave ?? ''),
      soggetto: String(r?.soggetto ?? ''),
      misura: String(r?.misura ?? ''),
      pezzi: Math.max(0, Math.floor(Number(r?.pezzi) || 0)),
      prezzo: Number(r?.prezzo) || 0,
    }))
    .filter((r) => r.chiave && r.pezzi > 0)
}

/** "Volpina piccola ×5, Draghetto innamorato grande ×3" */
export function descriviRighe(righe: RigaOrdine[]): string {
  return righe.map((r) => `${r.soggetto} ${r.misura.toLowerCase()} ×${r.pezzi}`).join(', ')
}
