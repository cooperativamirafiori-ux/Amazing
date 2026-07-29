'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import type { Bene, Prenotazione, StatoPagamento } from '@/types'

type Tab = 'catalogo' | 'prenotazioni' | 'admin'

type SortKey = 'data' | 'stato' | 'consegna'
type SortDir = 'asc' | 'desc'

const STATO_ORDER: Record<StatoPagamento, number> = { pending: 0, paid: 1, annullato: 2 }

const STATO_LABEL: Record<StatoPagamento, string> = {
  pending: 'In attesa',
  paid: 'Pagato',
  annullato: 'Annullato',
}
const STATO_COLOR: Record<StatoPagamento, string> = {
  pending: 'bg-amber-100 text-amber-800',
  paid: 'bg-emerald-100 text-emerald-800',
  annullato: 'bg-red-100 text-red-700',
}
const METODO_LABEL: Record<string, string> = {
  paypal: 'PayPal',
  satispay: 'Satispay',
  bonifico: 'Bonifico',
}

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>('prenotazioni')

  return (
    <div>
      <div className="mb-6 flex gap-2">
        <TabBtn active={tab === 'prenotazioni'} onClick={() => setTab('prenotazioni')}>
          Prenotazioni
        </TabBtn>
        <TabBtn active={tab === 'catalogo'} onClick={() => setTab('catalogo')}>
          Catalogo
        </TabBtn>
        <TabBtn active={tab === 'admin'} onClick={() => setTab('admin')}>
          Amministratori
        </TabBtn>
      </div>
      {tab === 'prenotazioni' && <Prenotazioni />}
      {tab === 'catalogo' && <Catalogo />}
      {tab === 'admin' && <Amministratori />}
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-5 py-2 text-sm font-bold transition ${
        active ? 'bg-brand text-white' : 'bg-white text-brand-darker/70 hover:bg-brand/10'
      }`}
    >
      {children}
    </button>
  )
}

// ============================================================
// PRENOTAZIONI
// ============================================================

function Prenotazioni() {
  const [rows, setRows] = useState<Prenotazione[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  /** Chiave "<spItemId>:<azione>" dell'operazione lenta in corso. */
  const [busy, setBusy] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortKey>('data')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function toggleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(key)
      setSortDir('asc')
    }
  }

  const sortedRows = useMemo(() => {
    const arr = [...rows]
    arr.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'data') cmp = new Date(a.data || 0).getTime() - new Date(b.data || 0).getTime()
      else if (sortBy === 'stato') cmp = STATO_ORDER[a.stato] - STATO_ORDER[b.stato]
      else if (sortBy === 'consegna') cmp = Number(a.consegnato) - Number(b.consegnato)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [rows, sortBy, sortDir])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/prenotazioni')
    const data = await res.json()
    setRows(data.prenotazioni ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function setStato(p: Prenotazione, stato: StatoPagamento) {
    if (stato === 'paid' && !confirm(`Confermare il pagamento e inviare la ricevuta a ${p.email}?`))
      return
    setMsg('')
    const res = await fetch(`/api/admin/prenotazioni/${p.spItemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stato }),
    })
    const data = await res.json()
    if (!res.ok) setMsg(data.error || 'Errore')
    else if (data.avvisi?.length)
      // Il pagamento è registrato: gli avvisi riguardano email/PDF/archiviazione.
      setMsg(`Pagamento registrato (${data.numeroRicevuta}) — ${data.avvisi.join(' · ')}`)
    else if (data.giaPagata) setMsg(`Già registrata come pagata (${data.numeroRicevuta}).`)
    else if (data.numeroRicevuta) setMsg(`Ricevuta ${data.numeroRicevuta} inviata a ${p.email}`)
    await load()
  }

  /** Rigenera il PDF, lo reinvia al donatore e ne salva la copia. */
  async function reinvia(p: Prenotazione) {
    if (!confirm(`Reinviare la ricevuta ${p.numeroRicevuta} a ${p.email}?`)) return
    setMsg('')
    setBusy(`${p.spItemId}:reinvia`)
    const res = await fetch(`/api/admin/prenotazioni/${p.spItemId}/reinvia`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) setMsg(data.error || 'Errore durante il reinvio')
    else setMsg(`Ricevuta ${data.numeroRicevuta} reinviata a ${data.email}`)
    await load()
  }

  /** Rigenera il PDF e salva/sovrascrive la copia nella cartella SharePoint. */
  async function archivia(p: Prenotazione) {
    setMsg('')
    setBusy(`${p.spItemId}:archivia`)
    const res = await fetch(`/api/admin/prenotazioni/${p.spItemId}/archivia`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) setMsg(data.error || 'Errore durante l’archiviazione')
    else setMsg(`Copia salvata su SharePoint: ${data.cartella}/${data.nomeFile}`)
    await load()
  }

  async function elimina(p: Prenotazione) {
    if (!confirm('Eliminare definitivamente questa prenotazione?')) return
    await fetch(`/api/admin/prenotazioni/${p.spItemId}`, { method: 'DELETE' })
    await load()
  }

  async function setConsegna(p: Prenotazione, consegnato: boolean) {
    setMsg('')
    const res = await fetch(`/api/admin/prenotazioni/${p.spItemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consegnato }),
    })
    const data = await res.json()
    if (!res.ok) setMsg(data.error || 'Errore')
    await load()
  }

  /**
   * Chiede a PayPal/Satispay lo stato reale delle prenotazioni rimaste in
   * sospeso e le chiude. Lo fa anche il cron ogni 15 minuti: questo pulsante
   * serve per non aspettare (e come piano B se il cron non è attivo).
   */
  async function verificaPending() {
    setMsg('')
    setBusy('verifica')
    const res = await fetch('/api/cron/verifica-pending', { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) setMsg(d.error || 'Errore durante la verifica')
    else if (!d.trovate) setMsg('Nessuna prenotazione in sospeso da verificare.')
    else
      setMsg(
        `Verificate ${d.esaminate} di ${d.trovate}: ${d.completate} completate, ` +
          `${d.rilasciate} rilasciate, ${d.inAttesa} ancora in corso, ${d.errori} errori.` +
          (d.restanti ? ` Restano ${d.restanti}: rilancia per continuare.` : '')
      )
    await load()
  }

  if (loading) return <p className="text-brand-darker/60">Caricamento…</p>

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-brand-darker/60">
          Le prenotazioni PayPal/Satispay non pagate vengono verificate presso il provider e chiuse
          automaticamente ogni 15 minuti.
        </p>
        <ActionBtn onClick={verificaPending} title="Verifica subito, senza attendere il controllo automatico">
          {busy === 'verifica' ? 'Verifica in corso…' : 'Verifica pagamenti in sospeso'}
        </ActionBtn>
      </div>
      {msg && <p className="mb-4 rounded-lg bg-brand/10 px-4 py-3 text-sm text-brand-dark">{msg}</p>}
      <div className="overflow-x-auto rounded-xl border border-brand/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg text-left text-brand-darker/70">
            <tr>
              <SortableTh label="Data" sortKey="data" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
              <th className="px-4 py-3">Ricevuta</th>
              <th className="px-4 py-3">Nominativo</th>
              <th className="px-4 py-3">Bene</th>
              <th className="px-4 py-3 text-right">Importo</th>
              <th className="px-4 py-3">Metodo</th>
              <SortableTh
                label="Stato pagamento"
                sortKey="stato"
                sortBy={sortBy}
                sortDir={sortDir}
                onClick={toggleSort}
              />
              <SortableTh
                label="Stato consegna"
                sortKey="consegna"
                sortBy={sortBy}
                sortDir={sortDir}
                onClick={toggleSort}
              />
              <th className="px-4 py-3">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((p) => (
              <tr key={p.spItemId} className="border-t border-brand/5">
                <td className="px-4 py-3 whitespace-nowrap text-brand-darker/70">
                  {p.data ? new Date(p.data).toLocaleDateString('it-IT') : '—'}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {p.numeroRicevuta ? (
                    p.pdfUrl ? (
                      <a
                        href={p.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Apri il PDF archiviato su SharePoint"
                        className="text-brand-dark underline hover:text-brand"
                      >
                        {p.numeroRicevuta}
                      </a>
                    ) : (
                      <span title="Ricevuta emessa, copia su SharePoint non presente">
                        {p.numeroRicevuta}
                      </span>
                    )
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3">
                  {p.nome} {p.cognome}
                </td>
                <td className="px-4 py-3">{p.goodName}</td>
                <td className="px-4 py-3 text-right font-semibold">€ {Number(p.importo).toFixed(2)}</td>
                <td className="px-4 py-3 text-brand-darker/70">{METODO_LABEL[p.metodo] || p.metodo || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATO_COLOR[p.stato]}`}>
                    {STATO_LABEL[p.stato]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {p.consegnato ? (
                    <button
                      onClick={() => setConsegna(p, false)}
                      title="Annulla consegna"
                      className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 transition hover:bg-emerald-200"
                    >
                      Consegnato
                    </button>
                  ) : p.stato === 'paid' ? (
                    <ActionBtn variant="danger" onClick={() => setConsegna(p, true)}>
                      Da consegnare
                    </ActionBtn>
                  ) : (
                    <span className="text-xs text-brand-darker/40">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {p.stato === 'pending' && (
                      <ActionBtn onClick={() => setStato(p, 'paid')}>Conferma pagamento</ActionBtn>
                    )}
                    {p.stato === 'paid' && (
                      <ActionBtn
                        onClick={() => reinvia(p)}
                        title={`Rigenera la ricevuta e reinviala a ${p.email}`}
                      >
                        {busy === `${p.spItemId}:reinvia` ? 'Invio…' : 'Reinvia ricevuta'}
                      </ActionBtn>
                    )}
                    {p.numeroRicevuta && (
                      <ActionBtn
                        onClick={() => archivia(p)}
                        title={
                          p.pdfUrl
                            ? 'Rigenera il PDF e sovrascrivi la copia su SharePoint (senza email)'
                            : 'Salva la copia del PDF su SharePoint (senza email)'
                        }
                      >
                        {busy === `${p.spItemId}:archivia`
                          ? 'Archiviazione…'
                          : p.pdfUrl
                            ? 'Riarchivia'
                            : 'Archivia PDF'}
                      </ActionBtn>
                    )}
                    {p.stato !== 'annullato' && (
                      <ActionBtn variant="warn" onClick={() => setStato(p, 'annullato')}>
                        Annulla
                      </ActionBtn>
                    )}
                    {p.stato === 'annullato' && (
                      <ActionBtn variant="danger" onClick={() => elimina(p)}>
                        Elimina
                      </ActionBtn>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-brand-darker/50">
                  Nessuna prenotazione.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================
// CATALOGO
// ============================================================

const VUOTO = { name: '', description: '', price: '', quantity: '', image: '', flexibleAmount: false }

type FormBene = typeof VUOTO

function beneToForm(b: Bene): FormBene {
  return {
    name: b.name,
    description: b.description,
    price: String(b.price),
    quantity: String(b.quantity),
    image: b.image,
    flexibleAmount: b.flexibleAmount,
  }
}

function Catalogo() {
  const [rows, setRows] = useState<Bene[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormBene>(VUOTO)
  /** Bene in modifica: null = modalità "aggiungi". */
  const [editing, setEditing] = useState<Bene | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/beni')
    const data = await res.json()
    setRows(data.beni ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function apriModifica(b: Bene) {
    setEditing(b)
    setForm(beneToForm(b))
    setMsg('')
    setOk('')
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function annullaModifica() {
    setEditing(null)
    setForm(VUOTO)
    setMsg('')
    setOk('')
  }

  async function salva(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    setOk('')

    const price = Number(form.price)
    const quantity = Number(form.quantity)
    if (!form.name.trim()) return setMsg('Il nome è obbligatorio.')
    if (!Number.isFinite(price) || price < 0) return setMsg('Prezzo non valido.')
    if (!Number.isInteger(quantity) || quantity < 0) return setMsg('Quantità non valida.')
    // La quantità totale non può scendere sotto i pezzi già prenotati/venduti.
    if (editing && quantity < editing.venduti)
      return setMsg(
        `Quantità troppo bassa: ci sono già ${editing.venduti} pezzi prenotati o venduti.`
      )

    const payload = {
      name: form.name.trim(),
      description: form.description,
      price,
      quantity,
      image: form.image.trim(),
      flexibleAmount: form.flexibleAmount,
    }

    setSaving(true)
    const res = await fetch(
      editing ? `/api/admin/beni/${editing.spItemId}` : '/api/admin/beni',
      {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )
    const data = await res.json().catch(() => ({}))
    setSaving(false)

    if (!res.ok) {
      setMsg(data.error || 'Errore')
      return
    }
    setOk(editing ? `"${payload.name}" aggiornato.` : `"${payload.name}" aggiunto al catalogo.`)
    setEditing(null)
    setForm(VUOTO)
    await load()
  }

  async function elimina(b: Bene) {
    if (!confirm(`Eliminare "${b.name}" dal catalogo?`)) return
    const res = await fetch(`/api/admin/beni/${b.spItemId}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setMsg(data.error || 'Errore durante l’eliminazione')
      return
    }
    if (editing?.spItemId === b.spItemId) annullaModifica()
    await load()
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <form
        onSubmit={salva}
        className={`h-fit rounded-xl border bg-white p-5 ${
          editing ? 'border-brand ring-2 ring-brand/20' : 'border-brand/10'
        }`}
      >
        <h3 className="font-display mb-3 text-lg font-bold text-brand-darker">
          {editing ? 'Modifica bene' : 'Aggiungi bene'}
        </h3>
        {editing && (
          <p className="mb-3 rounded-lg bg-brand/10 px-3 py-2 text-xs text-brand-dark">
            Stai modificando <strong>{editing.name}</strong> — venduti/prenotati:{' '}
            {editing.venduti}
          </p>
        )}
        <Inp label="Nome" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Inp label="Descrizione" value={form.description} onChange={(v) => setForm({ ...form, description: v })} textarea />
        <Inp
          label="Prezzo / donazione minima (€)"
          value={form.price}
          onChange={(v) => setForm({ ...form, price: v })}
          type="number"
          step="0.01"
          min="0"
        />
        <Inp
          label="Quantità"
          value={form.quantity}
          onChange={(v) => setForm({ ...form, quantity: v })}
          type="number"
          step="1"
          min={editing ? String(editing.venduti) : '0'}
        />
        <Inp label="URL immagine" value={form.image} onChange={(v) => setForm({ ...form, image: v })} />
        {form.image && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={form.image}
            alt=""
            className="mt-2 h-24 w-full rounded-lg object-cover"
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.display = 'none'
            }}
          />
        )}
        <label className="mt-3 flex items-center gap-2 text-sm text-brand-darker/80">
          <input
            type="checkbox"
            checked={form.flexibleAmount}
            onChange={(e) => setForm({ ...form, flexibleAmount: e.target.checked })}
          />
          Importo libero (il donatore può dare di più)
        </label>
        {msg && <p className="mt-3 text-sm text-red-600">{msg}</p>}
        {ok && <p className="mt-3 text-sm text-emerald-700">{ok}</p>}
        <div className="mt-4 flex gap-2">
          <button
            disabled={saving}
            className="flex-1 rounded-full bg-brand px-5 py-2.5 font-bold text-white transition hover:bg-brand-dark disabled:opacity-50"
          >
            {saving ? 'Salvataggio…' : editing ? 'Salva modifiche' : 'Aggiungi'}
          </button>
          {editing && (
            <button
              type="button"
              onClick={annullaModifica}
              className="rounded-full bg-brand/10 px-5 py-2.5 font-bold text-brand-dark transition hover:bg-brand/20"
            >
              Annulla
            </button>
          )}
        </div>
      </form>

      <div className="lg:col-span-2">
        {loading ? (
          <p className="text-brand-darker/60">Caricamento…</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-brand/10 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-brand-bg text-left text-brand-darker/70">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3 text-right">Prezzo</th>
                  <th className="px-4 py-3 text-right">Disp.</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr
                    key={b.spItemId}
                    className={`border-t border-brand/5 ${
                      editing?.spItemId === b.spItemId ? 'bg-brand/5' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <span className="font-semibold text-brand-darker">{b.name}</span>
                      {b.flexibleAmount && <span className="ml-2 text-xs text-brand/60">(libero)</span>}
                      {b.description && (
                        <span className="mt-0.5 block max-w-md truncate text-xs text-brand-darker/50">
                          {b.description}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">€ {b.price.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">
                      {b.available}/{b.quantity}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <ActionBtn onClick={() => apriModifica(b)}>Modifica</ActionBtn>
                        <ActionBtn variant="danger" onClick={() => elimina(b)}>
                          Elimina
                        </ActionBtn>
                      </div>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-brand-darker/50">
                      Nessun bene nel catalogo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Inp({
  label,
  value,
  onChange,
  type = 'text',
  step,
  min,
  textarea = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  step?: string
  min?: string
  textarea?: boolean
}) {
  const cls =
    'w-full rounded-lg border border-brand/20 px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20'
  return (
    <label className="mt-3 block text-sm">
      <span className="mb-1 block font-semibold text-brand-darker">{label}</span>
      {textarea ? (
        <textarea value={value} rows={3} onChange={(e) => onChange(e.target.value)} className={cls} />
      ) : (
        <input
          value={value}
          type={type}
          step={step}
          min={min}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      )}
    </label>
  )
}

function ActionBtn({
  children,
  onClick,
  variant = 'default',
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  variant?: 'default' | 'warn' | 'danger'
  title?: string
}) {
  const cls = {
    default: 'bg-brand/10 text-brand-dark hover:bg-brand/20',
    warn: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
    danger: 'bg-red-100 text-red-700 hover:bg-red-200',
  }[variant]
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${cls}`}
    >
      {children}
    </button>
  )
}

function SortableTh({
  label,
  sortKey,
  sortBy,
  sortDir,
  onClick,
}: {
  label: string
  sortKey: SortKey
  sortBy: SortKey
  sortDir: SortDir
  onClick: (key: SortKey) => void
}) {
  const active = sortBy === sortKey
  return (
    <th className="px-4 py-3">
      <button
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 font-bold transition hover:text-brand-dark ${
          active ? 'text-brand-dark' : ''
        }`}
      >
        {label}
        <span className="text-[10px]">{active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
      </button>
    </th>
  )
}

// ============================================================
// AMMINISTRATORI
// ============================================================

function Amministratori() {
  const [seed, setSeed] = useState<string[]>([])
  const [admins, setAdmins] = useState<{ spItemId: string; email: string }[]>([])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/admins')
    const data = await res.json()
    setSeed(data.seed ?? [])
    setAdmins(data.admins ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function aggiungi(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    const res = await fetch('/api/admin/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await res.json()
    if (!res.ok) setMsg(data.error || 'Errore')
    else {
      setEmail('')
      await load()
    }
  }

  async function rimuovi(a: { spItemId: string; email: string }) {
    if (!confirm(`Rimuovere l'amministratore ${a.email}?`)) return
    await fetch(`/api/admin/admins/${a.spItemId}`, { method: 'DELETE' })
    await load()
  }

  if (loading) return <p className="text-brand-darker/60">Caricamento…</p>

  return (
    <div className="max-w-2xl">
      <form onSubmit={aggiungi} className="mb-6 flex gap-2 rounded-xl border border-brand/10 bg-white p-5">
        <input
          type="email"
          value={email}
          required
          placeholder="nome.cognome@cooperativamirafiori.com"
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-lg border border-brand/20 px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <button className="rounded-full bg-brand px-5 py-2 font-bold text-white hover:bg-brand-dark">
          Aggiungi
        </button>
      </form>
      {msg && <p className="mb-4 text-sm text-red-600">{msg}</p>}

      <div className="overflow-hidden rounded-xl border border-brand/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg text-left text-brand-darker/70">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Origine</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {seed.map((e) => (
              <tr key={`seed-${e}`} className="border-t border-brand/5">
                <td className="px-4 py-3">{e}</td>
                <td className="px-4 py-3 text-brand-darker/50">fisso (env)</td>
                <td className="px-4 py-3"></td>
              </tr>
            ))}
            {admins
              .filter((a) => !seed.includes(a.email.toLowerCase()))
              .map((a) => (
                <tr key={a.spItemId} className="border-t border-brand/5">
                  <td className="px-4 py-3">{a.email}</td>
                  <td className="px-4 py-3 text-brand-darker/50">lista</td>
                  <td className="px-4 py-3 text-right">
                    <ActionBtn variant="danger" onClick={() => rimuovi(a)}>
                      Rimuovi
                    </ActionBtn>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-brand-darker/50">
        Gli admin &ldquo;fisso (env)&rdquo; sono definiti nella configurazione e non si rimuovono da qui.
        Gli altri si aggiungono/rimuovono al volo, senza redeploy.
      </p>
    </div>
  )
}
