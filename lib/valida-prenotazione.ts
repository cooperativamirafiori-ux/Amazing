/** Validazione condivisa del payload di checkout (PayPal/Satispay/Bonifico). */
import type { NuovaPrenotazione, MetodoPagamento } from '@/types'
import { codiceValido, normalizzaCodice, type TipoDonatore } from '@/lib/donatore'

export function validaPrenotazione(
  body: any,
  metodoAtteso: MetodoPagamento
): { ok: true; data: NuovaPrenotazione } | { ok: false; error: string } {
  const tipo: TipoDonatore = body?.tipoDonatore === 'giuridica' ? 'giuridica' : 'fisica'

  // Persona giuridica: niente cognome (nome = ragione sociale).
  const required =
    tipo === 'giuridica'
      ? (['goodId', 'nome', 'indirizzo', 'codiceFiscale', 'email'] as const)
      : (['goodId', 'nome', 'cognome', 'indirizzo', 'codiceFiscale', 'email'] as const)
  for (const k of required) {
    if (!String(body?.[k] ?? '').trim()) return { ok: false, error: `Campo obbligatorio mancante: ${k}` }
  }

  const codice = normalizzaCodice(body.codiceFiscale)
  if (!codiceValido(codice, tipo)) {
    return {
      ok: false,
      error: tipo === 'giuridica' ? 'Codice fiscale o Partita IVA non validi' : 'Codice fiscale non valido',
    }
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
      cognome: tipo === 'giuridica' ? '' : String(body.cognome).trim(),
      indirizzo: String(body.indirizzo).trim(),
      codiceFiscale: codice,
      email: String(body.email).trim(),
      importo,
      metodo: metodoAtteso,
      tipoDonatore: tipo,
    },
  }
}
