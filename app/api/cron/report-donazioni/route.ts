/**
 * Report quindicinale delle donazioni /dona per progetto (vedi
 * lib/report-donazioni.ts).
 *
 * ACCESSO — due strade:
 *  - Vercel Cron (`Authorization: Bearer <CRON_SECRET>`): schedulato in
 *    vercel.json ogni lunedì alle 06:00 UTC, ma invia solo un lunedì su due
 *    (settimane pari da LUNEDI_ANCORA). Gli altri lunedì risponde "saltato".
 *  - admin autenticato: senza parametri restituisce l'ANTEPRIMA in JSON delle
 *    ultime due settimane, senza inviare nulla. Parametri opzionali:
 *      ?da=YYYY-MM-DD&a=YYYY-MM-DD   periodo personalizzato (`a` escluso)
 *      ?invia=1                      invia davvero l'email
 */
import { NextRequest, NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/api-guard'
import {
  calcolaReport,
  eGiornoDiInvio,
  giornoRoma,
  inviaReport,
  periodoQuindicinale,
} from '@/lib/report-donazioni'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const GIORNO = /^\d{4}-\d{2}-\d{2}$/

async function esegui(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const daCron = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  if (!daCron) {
    const g = await guardAdmin()
    if (g.error) return g.error
  }

  const oggi = giornoRoma(new Date())
  const q = req.nextUrl.searchParams

  if (daCron && !eGiornoDiInvio(oggi)) {
    console.log(`[cron/report-donazioni] ${oggi}: settimana di pausa, nessun invio`)
    return NextResponse.json({ ok: true, saltato: true, oggi })
  }

  let periodo = periodoQuindicinale(oggi)
  if (!daCron && q.get('da') && q.get('a')) {
    const da = q.get('da')!
    const a = q.get('a')!
    if (!GIORNO.test(da) || !GIORNO.test(a) || da >= a) {
      return NextResponse.json({ error: 'Periodo non valido (da/a in formato YYYY-MM-DD, da < a)' }, { status: 400 })
    }
    periodo = { da, a }
  }

  const report = await calcolaReport(periodo)
  const invia = daCron || q.get('invia') === '1'

  if (!invia) return NextResponse.json({ ok: true, anteprima: true, ...report })

  const destinatari = await inviaReport(report)
  console.log(
    '[cron/report-donazioni]',
    JSON.stringify({ periodo, donazioni: report.donazioni.length, totale: report.totale, destinatari })
  )
  return NextResponse.json({ ok: true, inviato: true, destinatari, ...report })
}

export async function GET(req: NextRequest) {
  return esegui(req)
}

export async function POST(req: NextRequest) {
  return esegui(req)
}
