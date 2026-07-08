import { NextRequest, NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/api-guard'
import { listAdmins, addAdmin, adminEmailsSeed } from '@/lib/lists'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await guardAdmin()
  if (g.error) return g.error
  try {
    // seed = admin fissi da env (non eliminabili dall'UI); list = gestibili
    return NextResponse.json({ seed: adminEmailsSeed(), admins: await listAdmins() })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Errore' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const g = await guardAdmin()
  if (g.error) return g.error
  try {
    const { email } = await req.json()
    const res = await addAdmin(String(email ?? ''))
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: 400 })
    return NextResponse.json({ admin: res }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Errore' }, { status: 500 })
  }
}
