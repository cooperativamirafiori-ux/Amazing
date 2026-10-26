'use client'

import { useState } from 'react'
import CheckoutForm from '@/app/checkout/[goodId]/CheckoutForm'
import type { Bene } from '@/types'

/**
 * Colori dei pulsanti progetto, assegnati in ordine e poi ripetuti.
 * Classi scritte per intero: Tailwind non vede le classi composte a runtime.
 *  - spento: fondo tenue + bordo colorato
 *  - scelto: fondo pieno, testo bianco
 */
const COLORI = [
  {
    spento: 'border-sky-300 bg-sky-50 hover:bg-sky-100',
    scelto: 'border-sky-600 bg-sky-600 ring-sky-300',
    titolo: 'text-sky-900',
  },
  {
    spento: 'border-orange-300 bg-orange-50 hover:bg-orange-100',
    scelto: 'border-orange-500 bg-orange-500 ring-orange-200',
    titolo: 'text-orange-900',
  },
  {
    spento: 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100',
    scelto: 'border-emerald-600 bg-emerald-600 ring-emerald-200',
    titolo: 'text-emerald-900',
  },
  {
    spento: 'border-violet-300 bg-violet-50 hover:bg-violet-100',
    scelto: 'border-violet-600 bg-violet-600 ring-violet-200',
    titolo: 'text-violet-900',
  },
  {
    spento: 'border-rose-300 bg-rose-50 hover:bg-rose-100',
    scelto: 'border-rose-500 bg-rose-500 ring-rose-200',
    titolo: 'text-rose-900',
  },
  {
    spento: 'border-teal-300 bg-teal-50 hover:bg-teal-100',
    scelto: 'border-teal-600 bg-teal-600 ring-teal-200',
    titolo: 'text-teal-900',
  },
]

/**
 * Scelta del progetto + modulo di donazione. Ogni pulsante è un bene del
 * canale MIR: il nome scelto finisce nella prenotazione (GoodName), così in
 * admin e sulla ricevuta si vede a quale progetto è destinata la donazione.
 */
export default function DonaClient({
  progetti,
  iniziale,
}: {
  progetti: Bene[]
  iniziale?: string
}) {
  const [sceltoId, setSceltoId] = useState(
    progetti.find((p) => p.spItemId === iniziale)?.spItemId ?? progetti[0].spItemId
  )
  const scelto = progetti.find((p) => p.spItemId === sceltoId) ?? progetti[0]

  return (
    <div className="space-y-8">
      {progetti.length > 1 && (
        <fieldset>
          <legend className="font-display mb-3 text-lg font-bold text-brand-darker">
            A cosa vuoi destinare la tua donazione?
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {progetti.map((p, i) => {
              const attivo = p.spItemId === scelto.spItemId
              const c = COLORI[i % COLORI.length]
              return (
                <button
                  type="button"
                  key={p.spItemId}
                  onClick={() => setSceltoId(p.spItemId)}
                  aria-pressed={attivo}
                  className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left shadow-sm transition ${
                    attivo ? `${c.scelto} ring-4` : c.spento
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                      attivo ? 'border-white bg-white text-brand-darker' : 'border-current bg-white ' + c.titolo
                    }`}
                  >
                    {attivo ? '✓' : ''}
                  </span>
                  <span className="min-w-0">
                    <span className={`block font-bold ${attivo ? 'text-white' : c.titolo}`}>
                      {p.name}
                    </span>
                    {p.description && (
                      <span
                        className={`mt-1 block text-sm ${attivo ? 'text-white/90' : 'text-brand-darker/70'}`}
                      >
                        {p.description}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      {/* Niente `key`: cambiando progetto i dati già inseriti restano. */}
      <CheckoutForm bene={scelto} />
    </div>
  )
}
