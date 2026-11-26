import { NextRequest, NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/api-guard'
import { updateBene, deleteBene, getBeneBySpId } from '@/lib/lists'
import type { Bene } from '@/types'
import { leggiTaglie, TAGLIE } from '@/lib/natale'
import { leggiVarianti } from '@/lib/spille'

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
    if (body.canale !== undefined) patch.canale = body.canale === 'MIR' ? 'MIR' : 'AMZ'
    if (body.sezione !== undefined) patch.sezione = body.sezione === 'NATALE' ? 'NATALE' : 'AMAZING'

    // Scorte per taglia (vetrina Natale). null/{} = il bene non ha taglie.
    if (body.taglie !== undefined) {
      const taglie = leggiTaglie(body.taglie)
      if (taglie) {
        // Senza lo storico per taglia non si saprebbe da quale taglia scalare
        // i pezzi già prenotati: meglio fermarsi che perdere il conteggio.
        if (!attuale.taglie && attuale.venduti > 0) {
          return NextResponse.json(
            {
              error: `Non si possono aggiungere le taglie a un bene con ${attuale.venduti} pezzi già prenotati: crea un nuovo prodotto.`,
            },
            { status: 400 }
          )
        }
        for (const t of TAGLIE) {
          const giaPresi = attuale.vendutiTaglie[t] ?? 0
          if (giaPresi > 0 && (taglie[t] ?? 0) < giaPresi) {
            return NextResponse.json(
              { error: `Taglia ${t}: scorta troppo bassa, ci sono già ${giaPresi} pezzi prenotati o venduti.` },
              { status: 400 }
            )
          }
        }
      } else if (attuale.taglie && attuale.venduti > 0) {
        return NextResponse.json(
          { error: 'Non si possono togliere le taglie a un bene con pezzi già prenotati.' },
          { status: 400 }
        )
      }
      patch.taglie = taglie
    }

    // Spille: scorta per soggetto|misura. Si modifica solo su un bene che ha
    // già le varianti (lo crea scripts/crea-spille-natale.mjs).
    if (body.varianti !== undefined && body.varianti !== null) {
      if (!attuale.varianti) {
        return NextResponse.json({ error: 'Questo prodotto non ha varianti' }, { status: 400 })
      }
      const varianti = leggiVarianti(body.varianti)
      if (!varianti) {
        return NextResponse.json({ error: 'Indica la scorta di almeno una spilla' }, { status: 400 })
      }
      for (const [k, gia] of Object.entries(attuale.vendutiVarianti)) {
        if (gia > 0 && (varianti[k] ?? 0) < gia) {
          return NextResponse.json(
            { error: `${k}: scorta troppo bassa, ci sono già ${gia} spille prenotate o vendute.` },
            { status: 400 }
          )
        }
      }
      patch.varianti = varianti
    }

    if (body.price !== undefined) {
      const price = Number(body.price)
      if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json({ error: 'Prezzo non valido' }, { status: 400 })
      }
      patch.price = price
    }

    // Con le taglie la quantità è la somma delle scorte: la calcola updateBene.
    // Idem per le spille: la quantità è la somma delle scorte per variante.
    if (body.quantity !== undefined && !patch.taglie && !attuale.varianti) {
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
