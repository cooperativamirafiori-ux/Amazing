/**
 * Tipo di donatore: persona fisica o persona giuridica (ente, azienda,
 * associazione). Solo la pagina /dona (serie MIR) offre la scelta; il
 * catalogo Amazing resta riservato alle persone fisiche.
 *
 * Nessuna colonna SharePoint dedicata: una persona giuridica si salva con
 *   Nome          = ragione sociale
 *   Cognome       = vuoto            ← è questo il segnale
 *   Indirizzo     = sede legale
 *   CodiceFiscale = C.F. dell'ente o Partita IVA (11 cifre, senza "IT")
 * Così PDF, email e archivio (che compongono "nome cognome") funzionano già.
 *
 * Nessuna dipendenza server: importabile anche dai componenti client.
 */

export type TipoDonatore = 'fisica' | 'giuridica'

export const CF_PERSONA_REGEX =
  /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST]{1}[0-9LMNPQRSTUV]{2}[A-Z]{1}[0-9LMNPQRSTUV]{3}[A-Z]{1}$/i

/** Normalizza C.F./P.IVA: maiuscolo, senza spazi, senza prefisso "IT" davanti a 11 cifre. */
export function normalizzaCodice(raw: string): string {
  const s = String(raw ?? '').replace(/\s+/g, '').toUpperCase()
  return /^IT\d{11}$/.test(s) ? s.slice(2) : s
}

/**
 * Partita IVA o C.F. numerico di ente (11 cifre) con cifra di controllo
 * valida (stesso algoritmo per entrambi).
 */
export function codiceNumericoValido(s: string): boolean {
  if (!/^\d{11}$/.test(s)) return false
  let somma = 0
  for (let i = 0; i < 10; i++) {
    let n = Number(s[i])
    if (i % 2 === 1) {
      n *= 2
      if (n > 9) n -= 9
    }
    somma += n
  }
  return (10 - (somma % 10)) % 10 === Number(s[10])
}

/**
 * Codice accettato per il tipo di donatore:
 *  - fisica:    C.F. a 16 caratteri
 *  - giuridica: P.IVA / C.F. ente a 11 cifre, oppure C.F. a 16 caratteri
 *               (ditte individuali senza P.IVA a portata di mano)
 */
export function codiceValido(codice: string, tipo: TipoDonatore): boolean {
  if (CF_PERSONA_REGEX.test(codice)) return true
  return tipo === 'giuridica' && codiceNumericoValido(codice)
}

/** Una prenotazione è di persona giuridica se il cognome è vuoto. */
export function isPersonaGiuridica(p: { cognome?: string }): boolean {
  return !String(p.cognome ?? '').trim()
}
