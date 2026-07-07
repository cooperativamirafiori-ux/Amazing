import { NextResponse } from 'next/server'
import { getBeniDisponibili } from '@/lib/lists'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET pubblico: catalogo dei beni disponibili. */
export async function GET() {
  try {
    return NextResponse.json({ beni: await getBeniDisponibili() })
  } catch (err: any) {
    console.error('[GET /api/beni]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore interno' }, { status: 500 })
  }
}
