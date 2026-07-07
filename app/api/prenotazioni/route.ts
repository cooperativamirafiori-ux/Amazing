import { NextRequest, NextResponse } from 'next/server'
import { creaPrenotazione } from '@/lib/lists'
import type { NuovaPrenotazione } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CF_REGEX = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST]{1}[0-9LMNPQRSTUV]{2}[A-Z]{1}[0-9LMNPQRSTUV]{3}[A-Z]{1}$/i

/** POST pubblico: crea una prenotazione (v1: solo bonifico). */
export async function POST(req: NextRequest) {
  let body: NuovaPrenotazione
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const required = ['goodId', 'nome', 'cognome', 'indirizzo', 'codiceFiscale', 'email'] as const
  for (const k of required) {
    if (!String((body as any)[k] ?? '').trim()) {
      return NextResponse.json({ error: `Campo obbligatorio mancante: ${k}` }, { status: 400 })
    }
  }
  if (!CF_REGEX.test(body.codiceFiscale.trim())) {
    return NextResponse.json({ error: 'Codice fiscale non valido' }, { status: 400 })
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email.trim())) {
    return NextResponse.json({ error: 'Email non valida' }, { status: 400 })
  }
  // v1: metodo forzato a bonifico
  const metodo = body.metodo === 'bonifico' ? 'bonifico' : 'bonifico'

  try {
    const res = await creaPrenotazione({ ...body, metodo })
    if ('error' in res) {
      return NextResponse.json({ error: res.error }, { status: 400 })
    }
    return NextResponse.json({ prenotazione: res.prenotazione }, { status: 201 })
  } catch (err: any) {
    console.error('[POST /api/prenotazioni]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore interno' }, { status: 500 })
  }
}
