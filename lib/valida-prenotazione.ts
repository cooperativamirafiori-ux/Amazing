/** Validazione condivisa del payload di checkout (PayPal/Satispay/Bonifico). */
import type { NuovaPrenotazione, MetodoPagamento } from '@/types'

const CF_REGEX =
  /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST]{1}[0-9LMNPQRSTUV]{2}[A-Z]{1}[0-9LMNPQRSTUV]{3}[A-Z]{1}$/i

export function validaPrenotazione(
  body: any,
  metodoAtteso: MetodoPagamento
): { ok: true; data: NuovaPrenotazione } | { ok: false; error: string } {
  const required = ['goodId', 'nome', 'cognome', 'indirizzo', 'codiceFiscale', 'email'] as const
  for (const k of required) {
    if (!String(body?.[k] ?? '').trim()) return { ok: false, error: `Campo obbligatorio mancante: ${k}` }
  }
  if (!CF_REGEX.test(String(body.codiceFiscale).trim())) {
    return { ok: false, error: 'Codice fiscale non valido' }
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(body.email).trim())) {
    return { ok: false, error: 'Email non valida' }
  }
  const importo = Number(body.importo)
  if (!importo || importo <= 0) return { ok: false, error: 'Importo non valido' }

  return {
    ok: true,
    data: {
      goodId: String(body.goodId),
      nome: String(body.nome).trim(),
      cognome: String(body.cognome).trim(),
      indirizzo: String(body.indirizzo).trim(),
      codiceFiscale: String(body.codiceFiscale).trim().toUpperCase(),
      email: String(body.email).trim(),
      importo,
      metodo: metodoAtteso,
    },
  }
}
