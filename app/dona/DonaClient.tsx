'use client'

import { useState } from 'react'
import CheckoutForm from '@/app/checkout/[goodId]/CheckoutForm'
import type { Bene } from '@/types'

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
            {progetti.map((p) => {
              const attivo = p.spItemId === scelto.spItemId
              return (
                <button
                  type="button"
                  key={p.spItemId}
                  onClick={() => setSceltoId(p.spItemId)}
                  aria-pressed={attivo}
                  className={`rounded-xl border bg-white p-4 text-left transition ${
                    attivo
                      ? 'border-brand bg-brand/5 ring-2 ring-brand/30'
                      : 'border-brand/20 hover:border-brand/40'
                  }`}
                >
                  <span className="block font-bold text-brand-darker">{p.name}</span>
                  {p.description && (
                    <span className="mt-1 block text-sm text-brand-darker/60">{p.description}</span>
                  )}
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
