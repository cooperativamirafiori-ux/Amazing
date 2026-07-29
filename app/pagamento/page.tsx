'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Stato = 'verifica' | 'paid' | 'pending' | 'canceled' | 'error'

export default function PagamentoRitornoPage() {
  const [stato, setStato] = useState<Stato>('verifica')
  const [messaggio, setMessaggio] = useState('Verifica del pagamento in corso…')
  const [numeroRicevuta, setNumeroRicevuta] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ppConfirm = params.get('paypal_confirm')
    const ppCancel = params.get('paypal_cancel')
    const satispayBooking = params.get('satispay_booking')
    const paypalOrderId = params.get('token') // aggiunto da PayPal al ritorno

    async function run() {
      try {
        if (ppCancel) {
          setStato('canceled')
          setMessaggio('Pagamento PayPal annullato. Puoi tornare al catalogo e riprovare.')
          return
        }

        if (ppConfirm) {
          if (!paypalOrderId) {
            setStato('pending')
            setMessaggio(
              'Pagamento PayPal in verifica. Se hai completato il pagamento riceverai la ricevuta via email.'
            )
            return
          }
          const res = await fetch('/api/pagamenti/paypal/capture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spItemId: ppConfirm, orderId: paypalOrderId }),
          })
          const data = await res.json()
          esito(res.ok, data)
          return
        }

        if (satispayBooking) {
          const res = await fetch('/api/pagamenti/satispay/finalize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spItemId: satispayBooking }),
          })
          const data = await res.json()
          esito(res.ok, data)
          return
        }

        setStato('error')
        setMessaggio('Nessun pagamento da verificare.')
      } catch {
        setStato('error')
        setMessaggio('Errore nella verifica del pagamento. Contatta la cooperativa.')
      }
    }

    function esito(okHttp: boolean, data: any) {
      if (okHttp && data.status === 'paid') {
        setStato('paid')
        setNumeroRicevuta(data.numeroRicevuta || '')
        setMessaggio('Pagamento confermato! La ricevuta fiscale è stata inviata via email.')
      } else if (data.status === 'canceled') {
        setStato('canceled')
        setMessaggio('Pagamento annullato. Puoi tornare al catalogo e riprovare.')
      } else if (data.status === 'pending') {
        setStato('pending')
        setMessaggio(
          'Pagamento non ancora confermato. Attendi qualche secondo e ricarica la pagina, oppure riceverai la ricevuta via email appena confermato.'
        )
      } else {
        setStato('error')
        setMessaggio(data.error || 'Errore nella conferma del pagamento.')
      }
    }

    run()
  }, [])

  const colore =
    stato === 'paid'
      ? 'text-emerald-700'
      : stato === 'error'
      ? 'text-red-700'
      : stato === 'canceled'
      ? 'text-brand-darker'
      : 'text-brand'

  const titolo =
    stato === 'paid'
      ? 'Grazie per la tua donazione!'
      : stato === 'canceled'
      ? 'Pagamento annullato'
      : stato === 'error'
      ? 'Qualcosa è andato storto'
      : stato === 'pending'
      ? 'Pagamento in verifica'
      : 'Verifica in corso…'

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <div className="rounded-2xl border border-brand/10 bg-white p-8 text-center shadow-sm">
        {stato === 'verifica' && (
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />
        )}
        <h1 className={`font-display text-2xl font-bold ${colore}`}>{titolo}</h1>
        <p className="mt-3 text-brand-darker/80">{messaggio}</p>
        {numeroRicevuta && (
          <p className="mt-3 text-sm text-brand-darker/70">
            Numero ricevuta: <strong>{numeroRicevuta}</strong>
          </p>
        )}
        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-dark"
        >
          Torna al catalogo
        </Link>
      </div>
    </main>
  )
}
