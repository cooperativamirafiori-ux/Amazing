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
    // Eccezione: i prodotti della vetrina Natale (donazione minima, ma da ritirare).
    const liberi = new Set(
      beni.filter((b) => b.flexibleAmount && b.sezione !== 'NATALE').map((b) => b.id)
    )
    // Serie AMZ/MIR: dal numero ricevuta, altrimenti dal canale del bene.
    const canale = new Map(beni.map((b) => [b.id, b.canale]))
    // Vetrina Natale: dal bene; se il bene è stato cancellato, da taglia/pezzi.
    const natale = new Set(beni.filter((b) => b.sezione === 'NATALE').map((b) => b.id))
    return NextResponse.json({
      prenotazioni: prenotazioni.map((p) => ({
        ...p,
        donazioneLibera: liberi.has(p.goodId),
        serie: serieDaNumero(p.numeroRicevuta) ?? canale.get(p.goodId) ?? SERIE_DEFAULT,
        natale: natale.has(p.goodId) || !!p.taglia || p.pezzi > 1,
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Errore' }, { status: 500 })
  }
}
