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
    else if (data.numeroRicevuta) setMsg(`Ricevuta ${data.numeroRicevuta} inviata a ${p.email}`)
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

  if (loading) return <p className="text-brand-darker/60">Caricamento…</p>

  return (
    <div>
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
                <td className="px-4 py-3 font-mono text-xs">{p.numeroRicevuta || '—'}</td>
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

function Catalogo() {
  const [rows, setRows] = useState<Bene[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<typeof VUOTO>(VUOTO)
  const [msg, setMsg] = useState('')

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

  async function aggiungi(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    const res = await fetch('/api/admin/beni', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        description: form.description,
        price: Number(form.price),
        quantity: Number(form.quantity),
        image: form.image,
        flexibleAmount: form.flexibleAmount,
      }),
    })
    const data = await res.json()
    if (!res.ok) setMsg(data.error || 'Errore')
    else {
      setForm(VUOTO)
      await load()
    }
  }

  async function elimina(b: Bene) {
    if (!confirm(`Eliminare "${b.name}" dal catalogo?`)) return
    await fetch(`/api/admin/beni/${b.spItemId}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <form onSubmit={aggiungi} className="rounded-xl border border-brand/10 bg-white p-5">
        <h3 className="font-display mb-3 text-lg font-bold text-brand-darker">Aggiungi bene</h3>
        <Inp label="Nome" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Inp label="Descrizione" value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
        <Inp label="Prezzo / donazione minima (€)" value={form.price} onChange={(v) => setForm({ ...form, price: v })} />
        <Inp label="Quantità" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} />
        <Inp label="URL immagine" value={form.image} onChange={(v) => setForm({ ...form, image: v })} />
        <label className="mt-3 flex items-center gap-2 text-sm text-brand-darker/80">
          <input
            type="checkbox"
            checked={form.flexibleAmount}
            onChange={(e) => setForm({ ...form, flexibleAmount: e.target.checked })}
          />
          Importo libero (il donatore può dare di più)
        </label>
        {msg && <p className="mt-3 text-sm text-red-600">{msg}</p>}
        <button className="mt-4 w-full rounded-full bg-brand px-5 py-2.5 font-bold text-white hover:bg-brand-dark">
          Aggiungi
        </button>
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
                  <tr key={b.spItemId} className="border-t border-brand/5">
                    <td className="px-4 py-3">
                      {b.name}
                      {b.flexibleAmount && <span className="ml-2 text-xs text-brand/60">(libero)</span>}
                    </td>
                    <td className="px-4 py-3 text-right">€ {b.price.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">
                      {b.available}/{b.quantity}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ActionBtn variant="danger" onClick={() => elimina(b)}>
                        Elimina
                      </ActionBtn>
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

function Inp({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="mt-3 block text-sm">
      <span className="mb-1 block font-semibold text-brand-darker">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-brand/20 px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
    </label>
  )
}

function ActionBtn({
  children,
  onClick,
  variant = 'default',
}: {
  children: React.ReactNode
  onClick: () => void
  variant?: 'default' | 'warn' | 'danger'
}) {
  const cls = {
    default: 'bg-brand/10 text-brand-dark hover:bg-brand/20',
    warn: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
    danger: 'bg-red-100 text-red-700 hover:bg-red-200',
  }[variant]
  return (
    <button onClick={onClick} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${cls}`}>
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
