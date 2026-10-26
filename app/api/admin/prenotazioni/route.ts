import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/api-guard'
import { getPrenotazioni, getBeni } from '@/lib/lists'
import { serieDaNumero, SERIE_DEFAULT } from '@/lib/serie'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await guardAdmin()
  if (g.error) return g.error
  try {
    const [prenotazioni, beni] = await Promise.all([getPrenotazioni(), getBeni()])
    // Beni a importo libero = donazioni pure: in admin non vanno "consegnate".
    const liberi = new Set(beni.filter((b) => b.flexibleAmount).map((b) => b.id))
    // Serie AMZ/MIR: dal numero ricevuta, altrimenti dal canale del bene.
    const canale = new Map(beni.map((b) => [b.id, b.canale]))
    return NextResponse.json({
      prenotazioni: prenotazioni.map((p) => ({
        ...p,
        donazioneLibera: liberi.has(p.goodId),
        serie: serieDaNumero(p.numeroRicevuta) ?? canale.get(p.goodId) ?? SERIE_DEFAULT,
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Errore' }, { status: 500 })
  }
}
