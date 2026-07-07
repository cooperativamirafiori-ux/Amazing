import { getBeniDisponibili } from '@/lib/lists'
import { COOP } from '@/lib/config'
import ShopGrid from './ShopGrid'
import type { Bene } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function ShopPage() {
  let beni: Bene[] = []
  let errore = ''
  try {
    beni = await getBeniDisponibili()
  } catch (e: any) {
    errore = e?.message ?? 'Errore nel caricamento del catalogo'
  }

  return (
    <main className="min-h-screen">
      <header className="bg-gradient-to-br from-brand-dark to-brand text-white">
        <div className="mx-auto max-w-6xl px-6 py-12 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">{COOP.nome}</p>
          <h1 className="font-display mt-2 text-4xl font-bold sm:text-5xl">{COOP.progetto}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-white/85">
            Prenota un bene con una donazione liberale. Riceverai via email una ricevuta valida ai
            fini fiscali.
          </p>
        </div>
      </header>

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
      </footer>
    </main>
  )
}
