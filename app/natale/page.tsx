import Link from 'next/link'
import { getBeniNatale } from '@/lib/lists'
import { COOP } from '@/lib/config'
import { NATALE } from '@/lib/natale'
import ShopGrid from '../ShopGrid'
import type { Bene } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata = {
  title: `${NATALE.titolo} · ${COOP.nome}`,
  description: NATALE.sottotitolo,
}

/**
 * Vetrina Natale 2026: prodotti della cooperativa (sezione NATALE della lista
 * Beni). Stessa griglia e stesso checkout del catalogo Amazing, con la palette
 * natalizia (classe `tema-natale`, vedi globals.css). Vedi lib/natale.ts.
 */
export default async function NatalePage() {
  let beni: Bene[] = []
  let errore = ''
  try {
    beni = await getBeniNatale()
  } catch (e: any) {
    errore = e?.message ?? 'Errore nel caricamento dei prodotti'
  }

  return (
    <main className="tema-natale min-h-screen bg-brand-bg text-brand-darker">
      <header className="relative overflow-hidden bg-gradient-to-br from-brand-dark to-brand text-white">
        <Fiocchi />
        <div className="relative mx-auto max-w-6xl px-6 pt-5">
          <Link href="/" className="text-sm text-white/80 hover:text-white">
            ← Torna al catalogo Amazing
          </Link>
        </div>
        <div className="relative mx-auto max-w-6xl px-6 pb-12 pt-6 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-accent">
            🎄 {COOP.nome}
          </p>
          <h1 className="font-display mt-2 text-4xl font-bold sm:text-5xl">{NATALE.titolo}</h1>
          <p className="font-display mx-auto mt-3 max-w-2xl text-xl text-white/95 sm:text-2xl">
            {NATALE.sottotitolo}
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-white/85">
            Magliette, borse e altri prodotti fatti da noi. Scegli il regalo con una donazione
            liberale: riceverai via email una ricevuta valida ai fini fiscali.
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-10">
        {errore ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{errore}</div>
        ) : (
          <ShopGrid
            beni={beni}
            vuoto="I regali di Natale stanno arrivando: torna a trovarci tra qualche giorno!"
          />
        )}
      </section>

      <footer className="mt-8 bg-gradient-to-br from-brand-dark to-brand py-6 text-center text-white/85">
        <p className="text-sm font-semibold">
          {COOP.nome} · &ldquo;{COOP.motto}&rdquo;
        </p>
        <p className="mt-1 text-xs text-white/60">{COOP.sito}</p>
        <p className="mt-2 text-xs">
          <Link href="/dona/privacy" className="underline hover:text-white">
            Informativa privacy donatori
          </Link>
        </p>
      </footer>
    </main>
  )
}

/** Fiocchi di neve decorativi nell'intestazione. */
function Fiocchi() {
  const fiocchi = [
    'left-[6%] top-6 text-5xl',
    'left-[22%] bottom-4 text-3xl',
    'right-[8%] top-10 text-6xl',
    'right-[26%] bottom-6 text-4xl',
    'left-[48%] top-3 text-2xl',
  ]
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 select-none text-white/15">
      {fiocchi.map((c) => (
        <span key={c} className={`absolute ${c}`}>
          ❄
        </span>
      ))}
    </div>
  )
}
