import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/api-guard'
import { getPrenotazioni } from '@/lib/lists'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await guardAdmin()
  if (g.error) return g.error
  try {
    return NextResponse.json({ prenotazioni: await getPrenotazioni() })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Errore' }, { status: 500 })
  }
}
