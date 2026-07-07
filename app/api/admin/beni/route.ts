import { NextRequest, NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/api-guard'
import { getBeni, addBene } from '@/lib/lists'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await guardAdmin()
  if (g.error) return g.error
  try {
    return NextResponse.json({ beni: await getBeni() })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Errore' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const g = await guardAdmin()
  if (g.error) return g.error
  try {
    const b = await req.json()
    if (!String(b.name ?? '').trim()) {
      return NextResponse.json({ error: 'Nome obbligatorio' }, { status: 400 })
    }
    const bene = await addBene(b)
    return NextResponse.json({ bene }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Errore' }, { status: 500 })
  }
}
