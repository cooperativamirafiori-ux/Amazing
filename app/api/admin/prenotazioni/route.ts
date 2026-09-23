import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/api-guard'
import { getPrenotazioni, getBeni } from '@/lib/lists'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await guardAdmin()
  if (g.error) return g.error
  try {
    const [prenotazioni, beni] = await Promise.all([getPrenotazioni(), getBeni()])
    // Beni a importo libero = donazioni pure: in admin non vanno "consegnate".
    const liberi = new Set(beni.filter((b) => b.flexibleAmount).map((b) => b.id))
    return NextResponse.json({
      prenotazioni: prenotazioni.map((p) => ({
        ...p,
        donazioneLibera: liberi.has(p.goodId),
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Errore' }, { status: 500 })
  }
}
