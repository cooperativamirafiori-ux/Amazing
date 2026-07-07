'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Bene, Prenotazione } from '@/types'

const BONIFICO_IBAN = 'IT31A0200801125000101772702'
const BONIFICO_BANCA = 'Banca Unicredit'

const CF_REGEX = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST]{1}[0-9LMNPQRSTUV]{2}[A-Z]{1}[0-9LMNPQRSTUV]{3}[A-Z]{1}$/i

export default function CheckoutForm({ bene }: { bene: Bene }) {
  const [form, setForm] = useState({
    nome: '',
    cognome: '',
    indirizzo: '',
    codiceFiscale: '',
    email: '',
    importo: bene.flexibleAmount ? '' : bene.price.toFixed(2),
  })
  const [privacy, setPrivacy] = useState(false)
  const [errore, setErrore] = useState('')
  const [loading, setLoading] = useState(false)
  const [ok, setOk] = useState<Prenotazione | null>(null)

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErrore('')

    const importo = Number(form.importo.replace(',', '.'))
    if (!CF_REGEX.test(form.codiceFiscale.trim())) return setErrore('Codice fiscale non valido')
    if (!privacy) return setErrore("Devi accettare l'informativa privacy")
    if (bene.flexibleAmount && importo < bene.price) {
      return setErrore(`La donazione minima è € ${bene.price.toFixed(2)}`)
    }

    setLoading(true)
    try {
      const res = await fetch('/api/prenotazioni', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goodId: bene.spItemId,
          nome: form.nome.trim(),
          cognome: form.cognome.trim(),
          indirizzo: form.indirizzo.trim(),
          codiceFiscale: form.codiceFiscale.trim().toUpperCase(),
          email: form.email.trim(),
          importo,
          metodo: 'bonifico',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Errore nella prenotazione')
      setOk(data.prenotazione)
    } catch (err: any) {
      setErrore(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (ok) {
    const causale = `Donazione Progetto Amazing - ${bene.name} - ${ok.id}`
    return (
      <div className="rounded-2xl border border-emerald-200 bg-white p-8 shadow-sm">
        <h2 className="font-display text-2xl font-bold text-emerald-700">Prenotazione registrata!</h2>
        <p className="mt-2 text-brand-darker/80">
          Completa la donazione con un bonifico bancario. Dopo la verifica riceverai la ricevuta
          fiscale via email all'indirizzo <strong>{ok.email}</strong>.
        </p>

        <dl className="mt-6 space-y-3 rounded-xl bg-brand-bg p-5 text-sm">
          <Row label="Intestatario" value="Cooperativa Sociale Mirafiori" />
          <Row label="Banca" value={BONIFICO_BANCA} />
          <Row label="IBAN" value={BONIFICO_IBAN} mono />
          <Row label="Importo" value={`€ ${Number(ok.importo).toFixed(2)}`} />
          <Row label="Causale" value={causale} />
        </dl>

        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-dark"
        >
          Torna al catalogo
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-brand/10 bg-white p-8 shadow-sm">
      <div className="mb-6 flex items-center gap-4 border-b border-brand/10 pb-6">
        {bene.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bene.image} alt={bene.name} className="h-20 w-20 rounded-lg object-cover" />
        )}
        <div>
          <h2 className="font-display text-xl font-bold text-brand-darker">{bene.name}</h2>
          <p className="text-sm text-brand-darker/70">
            {bene.flexibleAmount ? 'Donazione minima' : 'Donazione'} € {bene.price.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nome" value={form.nome} onChange={(v) => set('nome', v)} required />
        <Field label="Cognome" value={form.cognome} onChange={(v) => set('cognome', v)} required />
      </div>
      <Field label="Indirizzo completo" value={form.indirizzo} onChange={(v) => set('indirizzo', v)} required />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Codice fiscale"
          value={form.codiceFiscale}
          onChange={(v) => set('codiceFiscale', v.toUpperCase())}
          required
        />
        <Field label="Email" type="email" value={form.email} onChange={(v) => set('email', v)} required />
      </div>

      {bene.flexibleAmount && (
        <Field
          label={`Importo donazione (minimo € ${bene.price.toFixed(2)})`}
          type="text"
          value={form.importo}
          onChange={(v) => set('importo', v)}
          required
        />
      )}

      <label className="mt-4 flex items-start gap-3 text-sm text-brand-darker/80">
        <input
          type="checkbox"
          checked={privacy}
          onChange={(e) => setPrivacy(e.target.checked)}
          className="mt-1"
        />
        <span>
          Ho letto e accetto il trattamento dei dati personali ai sensi del GDPR 679/2016 per
          l'emissione della ricevuta di donazione.
        </span>
      </label>

      {errore && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{errore}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-6 w-full rounded-full bg-brand px-6 py-3 font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
      >
        {loading ? 'Invio in corso…' : 'Prosegui con il bonifico'}
      </button>
    </form>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
}) {
  return (
    <label className="mt-4 block text-sm">
      <span className="mb-1 block font-semibold text-brand-darker">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-brand/20 px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
    </label>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-brand-darker/60">{label}</dt>
      <dd className={`text-right font-semibold text-brand-darker ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
