/**
 * Verifica periodica delle prenotazioni online rimaste in sospeso.
 *
 * Per ogni prenotazione `pending` con metodo PayPal o Satispay più vecchia della
 * soglia (default 15 minuti, `PENDING_VERIFICA_MINUTI`), chiede al provider lo
 * stato reale e la chiude: completa se pagata, rilascia il pezzo se annullata,
 * lascia stare se non c'è ancora un esito definitivo. Vedi
 * `lib/verifica-pagamento.ts` per il dettaglio della logica.
 *
 * ACCESSO — due strade:
 *  - Vercel Cron: invia `Authorization: Bearer <CRON_SECRET>`. Schedulato in
 *    `vercel.json` **una volta al giorno** alle 05:00 UTC (07:00 in ora legale
 *    italiana, 06:00 in ora solare): così il catalogo si libera prima
 *    dell'inizio della giornata. Una volta al giorno è anche il massimo
 *    consentito dal piano Vercel Hobby.
 *  - admin autenticato: pulsante "Verifica pagamenti in sospeso" in area admin.
 *    È la strada da usare quando serve liberare un pezzo subito, senza
 *    aspettare il giro notturno.
 *
 * Se `CRON_SECRET` non è impostato l'accesso via bearer è disabilitato e resta
 * solo quello admin: meglio un endpoint inutilizzabile che uno aperto.
 *
 * Nota: la soglia dei 15 minuti (`PENDING_VERIFICA_MINUTI`) e la frequenza del
 * cron sono cose diverse. La soglia dice *quali* prenotazioni sono abbastanza
 * vecchie da poter essere verificate; il cron dice *quando* si guarda. Con un
 * giro al giorno un pezzo abbandonato può restare bloccato fino a 24 ore, a
 * meno che un operatore non prema il pulsante.
 */
import { NextRequest, NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/api-guard'
import { getPendingDaVerificare } from '@/lib/lists'
import { verificaPrenotazione, sogliaVerificaMinuti } from '@/lib/verifica-pagamento'
import type { EsitoVerifica } from '@/lib/verifica-pagamento'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** Le verifiche fanno più chiamate esterne a testa: serve margine. */
export const maxDuration = 60

/** Tetto per giro, per non superare il tempo massimo della funzione. */
const MAX_PER_GIRO = 20

async function esegui(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const daCron = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  if (!daCron) {
    const g = await guardAdmin()
    if (g.error) return g.error
  }

  const minuti = sogliaVerificaMinuti()
  const candidate = await getPendingDaVerificare(minuti)
  const daFare = candidate.slice(0, MAX_PER_GIRO)

  const esiti: EsitoVerifica[] = []
  // In sequenza, non in parallelo: le verifiche scrivono su Venduti con
  // concorrenza ottimistica e in parallelo si genererebbero 412 a catena.
  for (const pren of daFare) {
    esiti.push(await verificaPrenotazione(pren))
  }

  const conta = (a: EsitoVerifica['azione']) => esiti.filter((e) => e.azione === a).length
  const riepilogo = {
    sogliaMinuti: minuti,
    trovate: candidate.length,
    esaminate: daFare.length,
    restanti: Math.max(0, candidate.length - daFare.length),
    completate: conta('completata'),
    rilasciate: conta('rilasciata'),
    inAttesa: conta('attesa'),
    errori: conta('errore'),
  }

  console.log('[cron/verifica-pending]', JSON.stringify(riepilogo))
  for (const e of esiti) {
    if (e.azione === 'completata' || e.azione === 'rilasciata' || e.azione === 'errore') {
      console.log(`[cron/verifica-pending] ${e.id} ${e.metodo} → ${e.azione}: ${e.dettaglio ?? ''}`)
    }
  }

  return NextResponse.json({ ok: true, ...riepilogo, esiti })
}

export async function GET(req: NextRequest) {
  return esegui(req)
}

export async function POST(req: NextRequest) {
  return esegui(req)
}
