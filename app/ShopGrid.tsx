'use client'

import Link from 'next/link'
import type { Bene } from '@/types'

export default function ShopGrid({ beni }: { beni: Bene[] }) {
  if (!beni.length) {
    return (
      <div className="rounded-xl border border-brand/20 bg-white p-10 text-center text-brand-darker/70">
        Al momento non ci sono beni disponibili. Torna presto a trovarci!
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {beni.map((b) => (
        <article
          key={b.spItemId}
          className="flex flex-col overflow-hidden rounded-2xl border border-brand/10 bg-white shadow-sm transition hover:shadow-md"
        >
          <div className="relative aspect-[4/3] bg-brand-bg">
            {b.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.image} alt={b.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-brand/30">Nessuna immagine</div>
            )}
            {b.available <= 3 && (
              <span className="absolute left-3 top-3 rounded-full bg-brand-accent px-3 py-1 text-xs font-bold text-white shadow">
                Ultimi {b.available}!
              </span>
            )}
          </div>

          <div className="flex flex-1 flex-col p-5">
            <h3 className="font-display text-lg font-bold text-brand-darker">{b.name}</h3>
            <p className="mt-1 flex-1 text-sm text-brand-darker/70">{b.description}</p>

            <div className="mt-4 flex items-end justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-brand/60">
                  {b.flexibleAmount ? 'Donazione minima' : 'Donazione'}
                </p>
                <p className="text-2xl font-bold text-brand">€ {b.price.toFixed(2)}</p>
              </div>
              <Link
                href={`/checkout/${b.spItemId}`}
                className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-dark"
              >
                Prenota
              </Link>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}
