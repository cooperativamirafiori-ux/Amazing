'use client'

import type { Bene } from '@/types'
import { MISURE_SPILLE, SOGGETTI_SPILLE, SPILLE, chiaveVariante } from '@/lib/spille'

/**
 * Griglia di scelta delle spille (bene a varianti, vedi lib/spille.ts): una
 * scheda per soggetto con un contatore per ogni misura. Le varianti esaurite o
 * non in vendita restano visibili ma disattivate.
 */
export default function GrigliaSpille({
  bene,
  qta,
  onChange,
  totale,
  pezzi,
}: {
  bene: Bene
  qta: Record<string, number>
  onChange: (chiave: string, n: number) => void
  totale: number
  pezzi: number
}) {
  const varianti = bene.varianti ?? {}
  const soggetti = SOGGETTI_SPILLE.filter((s) =>
    MISURE_SPILLE.some((m) => varianti[chiaveVariante(s.codice, m.codice)] !== undefined)
  )
  const pieno = pezzi >= SPILLE.maxPezzi

  return (
    <div className="mb-6">
      <div className="rounded-xl bg-brand-bg p-4 text-sm text-brand-darker/80">
        Scegli quante spille vuoi per ogni soggetto e misura:{' '}
        {MISURE_SPILLE.map((m) => `${m.nome.toLowerCase()} € ${m.prezzo}`).join(', ')}.
        <span className="mt-1 block text-xs text-brand-darker/60">Disegni di {SPILLE.autrici}.</span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {soggetti.map((s) => {
          const scelte = MISURE_SPILLE.reduce(
            (t, m) => t + (qta[chiaveVariante(s.codice, m.codice)] ?? 0),
            0
          )
          return (
            <div
              key={s.codice}
              className={`flex gap-3 rounded-xl border bg-white p-3 transition ${
                scelte ? 'border-brand ring-2 ring-brand/20' : 'border-brand/15'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.immagine}
                alt={s.nome}
                className="h-20 w-20 shrink-0 rounded-full object-cover"
                loading="lazy"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display font-bold text-brand-darker">{s.nome}</p>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  {MISURE_SPILLE.map((m) => {
                    const k = chiaveVariante(s.codice, m.codice)
                    const inVendita = varianti[k] !== undefined
                    const disp = bene.disponibiliVarianti[k] ?? 0
                    const n = qta[k] ?? 0
                    const esaurita = !inVendita || disp <= 0
                    return (
                      <div key={m.codice} className="text-center">
                        <span
                          className={`block text-[11px] font-semibold ${
                            esaurita ? 'text-brand-darker/30 line-through' : 'text-brand-darker/70'
                          }`}
                          title={esaurita ? 'Esaurita' : `${disp} disponibili`}
                        >
                          {m.nome} €{m.prezzo}
                        </span>
                        <div
                          className={`mt-0.5 flex items-center justify-between rounded-lg border ${
                            n ? 'border-brand bg-brand/5' : 'border-brand/25'
                          } ${esaurita ? 'opacity-40' : ''}`}
                        >
                          <button
                            type="button"
                            aria-label={`Una ${s.nome} ${m.nome.toLowerCase()} in meno`}
                            onClick={() => onChange(k, n - 1)}
                            disabled={n <= 0}
                            className="px-2 py-1 font-bold text-brand disabled:opacity-30"
                          >
                            −
                          </button>
                          <span className="text-sm font-bold text-brand-darker" aria-live="polite">
                            {n}
                          </span>
                          <button
                            type="button"
                            aria-label={`Una ${s.nome} ${m.nome.toLowerCase()} in più`}
                            onClick={() => onChange(k, n + 1)}
                            disabled={esaurita || n >= disp || pieno}
                            className="px-2 py-1 font-bold text-brand disabled:opacity-30"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="sticky bottom-3 z-10 mt-4 flex items-center justify-between gap-4 rounded-xl border border-brand/20 bg-white/95 px-5 py-3 shadow-md backdrop-blur">
        <span className="text-sm text-brand-darker/80">
          {pezzi === 0 ? 'Nessuna spilla scelta' : pezzi === 1 ? '1 spilla' : `${pezzi} spille`}
          {pieno && <span className="block text-xs">Massimo per ordine raggiunto</span>}
        </span>
        <span className="text-right">
          <span className="block text-xs uppercase tracking-wide text-brand-darker/60">
            {bene.flexibleAmount ? 'Donazione minima' : 'Donazione'}
          </span>
          <span className="text-2xl font-bold text-brand">€ {totale.toFixed(2)}</span>
        </span>
      </div>
    </div>
  )
}
