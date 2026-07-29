import { NextRequest, NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/api-guard'
import { updateBene, deleteBene, getBeneBySpId } from '@/lib/lists'
import type { Bene } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ spItemId: string }> }
) {
  const g = await guardAdmin()
  if (g.error) return g.error
  try {
    const { spItemId } = await params
    const body = await req.json()

    const attuale = await getBeneBySpId(spItemId)
    if (!attuale) return NextResponse.json({ error: 'Bene non trovato' }, { status: 404 })

    // Whitelist dei campi modificabili: `venduti` non si tocca da qui (lo gestisce
    // il flusso prenotazioni con concorrenza ottimistica).
    const patch: Partial<Bene> = {}

    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!name) return NextResponse.json({ error: 'Nome obbligatorio' }, { status: 400 })
      patch.name = name
    }
    if (body.description !== undefined) patch.description = String(body.description)
    if (body.image !== undefined) patch.image = String(body.image).trim()
    if (body.flexibleAmount !== undefined) patch.flexibleAmount = !!body.flexibleAmount

    if (body.price !== undefined) {
      const price = Number(body.price)
      if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json({ error: 'Prezzo non valido' }, { status: 400 })
      }
      patch.price = price
    }

    if (body.quantity !== undefined) {
      const quantity = Number(body.quantity)
      if (!Number.isInteger(quantity) || quantity < 0) {
        return NextResponse.json({ error: 'Quantità non valida' }, { status: 400 })
      }
      if (quantity < attuale.venduti) {
        return NextResponse.json(
          {
            error: `Quantità troppo bassa: ci sono già ${attuale.venduti} pezzi prenotati o venduti.`,
          },
          { status: 400 }
        )
      }
      patch.quantity = quantity
    }

    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: 'Nessun campo da aggiornare' }, { status: 400 })
    }

    await updateBene(spItemId, patch)
    return NextResponse.json({ ok: true, bene: await getBeneBySpId(spItemId) })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Errore' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ spItemId: string }> }
) {
  const g = await guardAdmin()
  if (g.error) return g.error
  try {
    const { spItemId } = await params
    await deleteBene(spItemId)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Errore' }, { status: 500 })
  }
}
