import Link from 'next/link'
import { getBeni, inCatalogo, inVetrinaNatale } from '@/lib/lists'
import { COOP } from '@/lib/config'
import { NATALE } from '@/lib/natale'
import ShopGrid from './ShopGrid'
import type { Bene } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function ShopPage() {
  let beni: Bene[] = []
  // Il banner Natale compare solo se c'è almeno un prodotto in vetrina.
  let natale = 0
  let errore = ''
  try {
    const tutti = await getBeni()
    beni = tutti.filter(inCatalogo)
    natale = tutti.filter(inVetrinaNatale).length
  } catch (e: any) {
    errore = e?.message ?? 'Errore nel caricamento del catalogo'
  }

  return (
    <main className="min-h-screen">
      <header className="bg-gradient-to-br from-brand-dark to-brand text-white">
        <div className="mx-auto flex max-w-6xl justify-end px-6 pt-4">
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">
              Area riservata staff
            </span>
            <Link
              href="/admin"
              className="rounded-full bg-white px-4 py-2 text-sm font-bold text-brand-dark shadow-sm transition hover:bg-white/90"
            >
              Accedi · Admin
            </Link>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-6 pb-12 pt-6 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">{COOP.nome}</p>
          <h1 className="font-display mt-2 text-4xl font-bold sm:text-5xl">{COOP.progetto}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-white/85">
            Prenota un bene con una donazione liberale. Riceverai via email una ricevuta valida ai
            fini fiscali.
          </p>
        </div>
      </header>

      {natale > 0 && <BannerNatale />}

      <section className="mx-auto max-w-6xl px-6 py-10">
        {errore ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
            {errore}
          </div>
        ) : (
          <ShopGrid beni={beni} />
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

/** Banner cliccabile verso la vetrina /natale (palette natalizia). */
function BannerNatale() {
  return (
    <div className="tema-natale mx-auto mt-8 max-w-6xl px-6">
      <Link
        href={NATALE.percorso}
        className="group relative block overflow-hidden rounded-2xl bg-gradient-to-r from-brand-dark to-brand px-6 py-7 text-white shadow-md transition hover:shadow-xl sm:px-10"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-4 -top-6 select-none text-8xl opacity-20 transition group-hover:rotate-12"
        >
          ❄
        </span>
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-[-1.5rem] right-24 hidden select-none text-7xl opacity-15 sm:block"
        >
          ❄
        </span>
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-accent">
              🎄 {NATALE.titolo}
            </p>
            <p className="font-display mt-1 text-2xl font-bold sm:text-3xl">{NATALE.sottotitolo}</p>
          </div>
          <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-brand shadow-sm transition group-hover:bg-brand-bg">
            Scopri i regali →
          </span>
        </div>
      </Link>
    </div>
  )
}
