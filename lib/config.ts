/** Costanti e helper di configurazione (lette da env con default sensati). */

export const COOP = {
  nome: 'Cooperativa Sociale Mirafiori',
  progetto: 'Progetto Amazing',
  motto: 'Saper Essere è Saper Amare',
  sito: 'www.cooperativamirafiori.com',
  rappresentante: process.env.RAPPRESENTANTE_LEGALE || 'LUCA CORDARO',
}

export const BONIFICO = {
  iban: process.env.BONIFICO_IBAN || 'IT31A0200801125000101772702',
  banca: process.env.BONIFICO_BANCA || 'Banca Unicredit',
}

export const BRAND = {
  blu: '#2C7BB8',
  bluDark: '#1a5a8a',
  bluDarker: '#1a3a52',
  arancio: '#E87A4A',
  bg: '#f0f6fb',
  gray: '#555555',
  lightGray: '#888888',
}

/** Metodi di pagamento supportati. */
export const METODO_LABEL: Record<string, string> = {
  paypal: 'PayPal',
  satispay: 'Satispay',
  bonifico: 'Bonifico bancario',
}

/**
 * URL base pubblico dell'app, usato per costruire redirect/callback di
 * Satispay e PayPal. Da impostare in Production (APP_BASE_URL o NEXTAUTH_URL).
 */
export function appBaseUrl(): string {
  const raw =
    process.env.APP_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'https://amazing-mirafiori.vercel.app'
  return raw.replace(/\/$/, '')
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || 'dennis.maseri@cooperativamirafiori.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}
