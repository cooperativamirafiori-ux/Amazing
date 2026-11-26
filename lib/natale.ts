/**
 * Sezione "Natale 2026": vetrina natalizia dentro il Progetto Amazing.
 *
 * I prodotti della cooperativa (magliette, bags, …) si inseriscono come gli
 * altri beni Amazing e si marcano con la colonna SharePoint `Sezione = NATALE`.
 * Restano beni del canale AMZ: stessi pagamenti, stessa serie di ricevute
 * (RIC-<anno>-AMZ-…), stesso archivio. Cambiano solo:
 *
 *   - dove compaiono: pagina `/natale` (non nel catalogo `/`), con un banner in
 *     home che ci porta;
 *   - nel checkout il donatore sceglie quanti pezzi (e la taglia, se il
 *     prodotto ne ha): un ordine = un prodotto, una taglia, N pezzi;
 *   - la donazione minima è prezzo × pezzi.
 *
 * Scorte per taglia: colonna `Taglie` (JSON, es. {"S":5,"M":10}) con la scorta
 * di ogni taglia e colonna `VendutiTaglie` (JSON) con i pezzi riservati/venduti
 * per taglia. Per questi prodotti `Quantita` e `Venduti` sono tenuti allineati
 * alle somme, così il resto dell'app continua a funzionare uguale.
 *
 * Nessuna env, nessuna dipendenza server: importabile anche dai componenti client.
 */

import { descriviRighe, type RigaOrdine } from '@/lib/spille'

export type Sezione = 'AMAZING' | 'NATALE'

export const TAGLIE = ['S', 'M', 'L', 'XL'] as const
export type Taglia = (typeof TAGLIE)[number]

/** Scorta (o venduti) per taglia. Le taglie assenti non sono vendute. */
export type ScortaTaglie = Partial<Record<Taglia, number>>

export const NATALE = {
  titolo: 'Natale 2026',
  sottotitolo: 'Regala i prodotti realizzati dalla Cooperativa Mirafiori',
  percorso: '/natale',
  ritornoLabel: 'Torna ai regali di Natale',
  /**
   * Banner in home verso /natale. Spento finché il catalogo non è completo
   * (2026-11-26): la pagina /natale resta raggiungibile con il link diretto.
   * Rimettere a true per pubblicarlo.
   */
  bannerAttivo: false,
  /** Massimo pezzi per singolo ordine (oltre si fanno più ordini). */
  maxPezzi: 20,
}

/** Valore della colonna `Sezione` → sezione. Vuoto o sconosciuto = Amazing. */
export function normalizzaSezione(raw: unknown): Sezione {
  return String(raw ?? '').trim().toUpperCase() === 'NATALE' ? 'NATALE' : 'AMAZING'
}

export function isTaglia(v: unknown): v is Taglia {
  return (TAGLIE as readonly string[]).includes(String(v))
}

/**
 * Legge una colonna JSON di taglie. Tollera vuoto, testo non valido e valori
 * negativi/non interi (scartati). Ritorna null se non c'è nessuna taglia.
 */
export function leggiTaglie(raw: unknown): ScortaTaglie | null {
  if (raw == null || raw === '') return null
  let obj: any = raw
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!obj || typeof obj !== 'object') return null
  const out: ScortaTaglie = {}
  for (const t of TAGLIE) {
    const n = Number(obj[t])
    if (Number.isInteger(n) && n >= 0 && obj[t] !== undefined && obj[t] !== null && obj[t] !== '')
      out[t] = n
  }
  return Object.keys(out).length ? out : null
}

/** Serializza per la colonna SharePoint (stringa vuota = nessuna taglia). */
export function scriviTaglie(t: ScortaTaglie | null | undefined): string {
  if (!t) return ''
  const out: ScortaTaglie = {}
  for (const k of TAGLIE) if (t[k] !== undefined) out[k] = t[k]
  return Object.keys(out).length ? JSON.stringify(out) : ''
}

export function sommaTaglie(t: ScortaTaglie | null | undefined): number {
  if (!t) return 0
  return TAGLIE.reduce((s, k) => s + (t[k] ?? 0), 0)
}

/**
 * Descrizione leggibile di cosa è stato prenotato: "Maglietta · Taglia M · 3 pezzi".
 * Per le spille (ordine a varianti) elenca le righe.
 * Per i beni classici (1 pezzo, nessuna taglia) è solo il nome.
 */
export function descriviBene(p: {
  goodName: string
  taglia?: string
  pezzi?: number
  righe?: RigaOrdine[]
}): string {
  // Ordine a varianti (spille): "Spille: Volpina piccola ×5, …"
  if (p.righe?.length) return `${p.goodName}: ${descriviRighe(p.righe)}`
  const parti = [p.goodName]
  if (p.taglia) parti.push(`Taglia ${p.taglia}`)
  if (p.pezzi && p.pezzi > 1) parti.push(`${p.pezzi} pezzi`)
  return parti.join(' · ')
}
