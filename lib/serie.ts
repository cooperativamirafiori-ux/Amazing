/**
 * Serie delle ricevute e "canale" di provenienza delle donazioni.
 *
 * L'app raccoglie donazioni da due pagine pubbliche che condividono lo stesso
 * modulo, gli stessi metodi di pagamento e la stessa lista Prenotazioni:
 *
 *   AMZ  catalogo del Progetto Amazing (`/` e `/checkout/<id>`)
 *        ricevute RIC-<anno>-AMZ-0001…, archivio …/Inviate/AMZ
 *   MIR  pagina "Donazioni Cooperativa Sociale Mirafiori" (`/dona`)
 *        ricevute RIC-<anno>-MIR-0001…, archivio …/Inviate/MIR
 *
 * Il canale è una proprietà del **bene** (colonna SharePoint `Canale` della
 * lista Beni: vuota = AMZ, "MIR" = pagina donazioni). Sulla pagina /dona ogni
 * bene del canale MIR è un progetto/servizio a cui destinare la donazione, e il
 * suo nome finisce in `GoodName` della prenotazione: così si sa sempre a quale
 * progetto ha scelto di donare la persona.
 *
 * Le due serie hanno contatori indipendenti. Una volta assegnato, il numero
 * ricevuta porta con sé la serie: archivio, PDF ed email la ricavano da lì.
 *
 * Nessuna env, nessuna dipendenza server: importabile anche dai componenti client.
 */

export type Serie = 'AMZ' | 'MIR'

export const SERIE_DEFAULT: Serie = 'AMZ'

export const SERIE: Record<
  Serie,
  {
    /** Nome mostrato nelle intestazioni (pagina, PDF, oggetto email). */
    etichetta: string
    /** Prefisso della causale (bonifico, PayPal). */
    causale: string
    /** Dove riportare il donatore a fine pagamento. */
    ritorno: string
    ritornoLabel: string
    /** Etichetta del campo GoodName su ricevuta email e admin. */
    etichettaBene: string
  }
> = {
  AMZ: {
    etichetta: 'Progetto Amazing',
    causale: 'Donazione Progetto Amazing',
    ritorno: '/',
    ritornoLabel: 'Torna al catalogo',
    etichettaBene: 'Bene prenotato',
  },
  MIR: {
    etichetta: 'Donazioni Cooperativa Sociale Mirafiori',
    causale: 'Donazione Cooperativa Sociale Mirafiori',
    ritorno: '/dona',
    ritornoLabel: 'Torna alla pagina donazioni',
    etichettaBene: 'Progetto sostenuto',
  },
}

/** Valore della colonna `Canale` → serie. Tutto ciò che non è "MIR" è Amazing. */
export function normalizzaSerie(raw: unknown): Serie {
  return String(raw ?? '').trim().toUpperCase() === 'MIR' ? 'MIR' : 'AMZ'
}

/** Serie letta dal numero ricevuta (`RIC-2026-MIR-0001` → MIR), null se assente. */
export function serieDaNumero(numeroRicevuta: string | undefined | null): Serie | null {
  const m = String(numeroRicevuta ?? '').match(/^RIC-\d{4}-([A-Z]+)-\d+/i)
  return m ? normalizzaSerie(m[1]) : null
}
