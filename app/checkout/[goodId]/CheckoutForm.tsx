'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Bene, Prenotazione, MetodoPagamento } from '@/types'
import { SERIE } from '@/lib/serie'
import { codiceValido, normalizzaCodice, type TipoDonatore } from '@/lib/donatore'

const BONIFICO_IBAN = 'IT31A0200801125000101772702'
const BONIFICO_BANCA = 'Banca Unicredit'

const METODI: { id: MetodoPagamento; icona: string; titolo: string; nota: string }[] = [
  { id: 'paypal', icona: '💳', titolo: 'PayPal', nota: 'Pagamento online immediato' },
  { id: 'satispay', icona: '📱', titolo: 'Satispay', nota: 'App mobile' },
  { id: 'bonifico', icona: '🏦', titolo: 'Bonifico', nota: 'Verifica manuale' },
]

/**
 * Chiave sessionStorage letta dalla pagina /pagamento per sapere dove
 * riportare il donatore (catalogo Amazing o pagina /dona).
 */
export const RITORNO_KEY = 'amazing:ritorno'

export default function CheckoutForm({ bene }: { bene: Bene }) {
  // Amazing o pagina /dona: cambia causale e link di ritorno, non il flusso.
  const serie = SERIE[bene.canale ?? 'AMZ']
  // Enti e aziende possono donare solo dalla pagina /dona (serie MIR).
  const ammetteEnti = bene.canale === 'MIR'
  const [tipo, setTipo] = useState<TipoDonatore>('fisica')
  const ente = ammetteEnti && tipo === 'giuridica'
  const [form, setForm] = useState({
    nome: '',
    cognome: '',
    indirizzo: '',
    codiceFiscale: '',
    email: '',
    importo: bene.flexibleAmount ? '' : bene.price.toFixed(2),
  })
  const [metodo, setMetodo] = useState<MetodoPagamento | null>(null)
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
    if (!metodo) return setErrore('Scegli un metodo di pagamento')
    const codice = normalizzaCodice(form.codiceFiscale)
    if (!codiceValido(codice, ente ? 'giuridica' : 'fisica')) {
      return setErrore(ente ? 'Codice fiscale o Partita IVA non validi' : 'Codice fiscale non valido')
    }
    if (!privacy) return setErrore("Devi accettare l'informativa privacy")
    if (bene.flexibleAmount && importo < bene.price) {
      return setErrore(`La donazione minima è € ${bene.price.toFixed(2)}`)
    }

    const payload = {
      goodId: bene.spItemId,
      nome: form.nome.trim(),
      cognome: ente ? '' : form.cognome.trim(),
      indirizzo: form.indirizzo.trim(),
      codiceFiscale: codice,
      email: form.email.trim(),
      importo,
      metodo,
      tipoDonatore: ente ? 'giuridica' : 'fisica',
    }

    setLoading(true)
    try {
      if (metodo === 'bonifico') {
        const res = await fetch('/api/prenotazioni', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, metodo: 'bonifico' }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Errore nella prenotazione')
        setOk(data.prenotazione)
        return
      }

      // PayPal / Satispay: crea la prenotazione e rimanda al provider
      const endpoint =
        metodo === 'paypal' ? '/api/pagamenti/paypal/start' : '/api/pagamenti/satispay/start'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Errore avvio pagamento')
      if (!data.redirect_url) throw new Error('Redirect di pagamento non disponibile. Riprova.')
      try {
        sessionStorage.setItem(
          RITORNO_KEY,
          JSON.stringify({ href: serie.ritorno, label: serie.ritornoLabel })
        )
      } catch {
        // storage non disponibile: la pagina di ritorno usa il catalogo
      }
      window.location.href = data.redirect_url
    } catch (err: any) {
      setErrore(err.message)
      setLoading(false)
    }
  }

  if (ok) {
    // Il numero ricevuta (assegnato alla creazione) serve all'operatore per
    // abbinare il bonifico alla prenotazione. Ripiego sull'id se mancasse.
    const causale = ok.numeroRicevuta
      ? `${serie.causale} - ${ok.numeroRicevuta}`
      : `${serie.causale} - ${bene.name} - ${ok.id}`
    return (
      <div className="rounded-2xl border border-emerald-200 bg-white p-8 shadow-sm">
        <h2 className="font-display text-2xl font-bold text-emerald-700">
          {bene.flexibleAmount ? 'Donazione registrata!' : 'Prenotazione registrata!'}
        </h2>
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
          href={serie.ritorno}
          className="mt-6 inline-block rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-dark"
        >
          {serie.ritornoLabel}
        </Link>
      </div>
    )
  }

  const ctaLabel =
    metodo === 'paypal'
      ? 'Paga con PayPal'
      : metodo === 'satispay'
      ? 'Paga con Satispay'
      : metodo === 'bonifico'
      ? 'Prosegui con il bonifico'
      : 'Scegli un metodo di pagamento'

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

      {ammetteEnti && (
        <fieldset>
          <legend className="mb-2 block text-sm font-semibold text-brand-darker">Chi dona?</legend>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { id: 'fisica', titolo: 'Persona fisica', nota: 'Privato cittadino' },
                { id: 'giuridica', titolo: 'Ente o azienda', nota: 'Impresa, associazione, ente' },
              ] as const
            ).map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => setTipo(t.id)}
                aria-pressed={tipo === t.id}
                className={`rounded-xl border p-3 text-center transition ${
                  tipo === t.id
                    ? 'border-brand bg-brand/5 ring-2 ring-brand/30'
                    : 'border-brand/20 hover:border-brand/40'
                }`}
              >
                <span className="block text-sm font-bold text-brand-darker">{t.titolo}</span>
                <span className="block text-xs text-brand-darker/60">{t.nota}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {ente ? (
        <Field
          label="Ragione sociale / denominazione"
          value={form.nome}
          onChange={(v) => set('nome', v)}
          required
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome" value={form.nome} onChange={(v) => set('nome', v)} required />
          <Field label="Cognome" value={form.cognome} onChange={(v) => set('cognome', v)} required />
        </div>
      )}
      <Field
        label={ente ? 'Sede legale (indirizzo completo)' : 'Indirizzo completo'}
        value={form.indirizzo}
        onChange={(v) => set('indirizzo', v)}
        required
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label={ente ? 'Partita IVA o codice fiscale' : 'Codice fiscale'}
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

      <fieldset className="mt-6">
        <legend className="mb-2 block text-sm font-semibold text-brand-darker">
          Metodo di pagamento
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {METODI.map((m) => (
            <button
              type="button"
              key={m.id}
              onClick={() => setMetodo(m.id)}
              className={`flex flex-col items-center gap-1 rounded-xl border p-4 text-center transition ${
                metodo === m.id
                  ? 'border-brand bg-brand/5 ring-2 ring-brand/30'
                  : 'border-brand/20 hover:border-brand/40'
              }`}
            >
              <span className="text-2xl" aria-hidden>
                {m.icona}
              </span>
              <span className="text-sm font-bold text-brand-darker">{m.titolo}</span>
              <span className="text-xs text-brand-darker/60">{m.nota}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mt-6 flex items-start gap-3 text-sm text-brand-darker/80">
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
        disabled={loading || !metodo}
        className="mt-6 w-full rounded-full bg-brand px-6 py-3 font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
      >
        {loading ? 'Attendi…' : ctaLabel}
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
