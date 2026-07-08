/**
 * Accesso alle SharePoint Lists (Beni, Prenotazioni) via Microsoft Graph.
 *
 * Disponibilità: gestita con un contatore `Venduti` sull'item del bene
 * (available = Quantita - Venduti), aggiornato in modo transazionale alla
 * creazione/annullamento della prenotazione. La concorrenza sull'ultimo pezzo
 * è protetta da concorrenza ottimistica via ETag (If-Match) con retry —
 * sostituisce il LockService dell'app Apps Script.
 *
 * Nomi interni colonne attesi (vedi README per la creazione delle liste):
 *   Beni:         Title(name), Descrizione, Prezzo, Quantita, Venduti,
 *                 Immagine, ImportoLibero(yes/no), IdLogico
 *   Prenotazioni: Title(id logico), NumeroRicevuta, GoodId, GoodName, Nome,
 *                 Cognome, Indirizzo, CodiceFiscale, Email, Importo, Data,
 *                 Metodo, Stato, PdfUrl
 */

import {
  graphGet,
  graphPost,
  graphPatch,
  graphPatchStatus,
  graphDelete,
} from '@/lib/graph'
import type { Bene, Prenotazione, NuovaPrenotazione, StatoPagamento } from '@/types'

const SITE = () => process.env.SHAREPOINT_SITE_ID!
const BENI = () => process.env.SP_LIST_BENI!
const PREN = () => process.env.SP_LIST_PRENOTAZIONI!
const ADMIN = () => process.env.SP_LIST_ADMIN || ''

const beniBase = () => `/sites/${SITE()}/lists/${BENI()}/items`
const prenBase = () => `/sites/${SITE()}/lists/${PREN()}/items`
const adminBase = () => `/sites/${SITE()}/lists/${ADMIN()}/items`

const PREFER_NON_INDEXED = {
  Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
}

// ============================================================
// Mapping
// ============================================================

function mapBene(item: any): Bene {
  const f = item.fields ?? {}
  const quantity = Number(f.Quantita ?? 0)
  const venduti = Number(f.Venduti ?? 0)
  return {
    spItemId: String(item.id),
    id: String(f.IdLogico || item.id),
    name: String(f.Title ?? ''),
    description: String(f.Descrizione ?? ''),
    price: Number(f.Prezzo ?? 0),
    quantity,
    venduti,
    image: String(f.Immagine ?? ''),
    flexibleAmount: f.ImportoLibero === true || String(f.ImportoLibero).toLowerCase() === 'true',
    available: Math.max(0, quantity - venduti),
  }
}

function mapPrenotazione(item: any): Prenotazione {
  const f = item.fields ?? {}
  return {
    spItemId: String(item.id),
    id: String(f.Title ?? ''),
    numeroRicevuta: String(f.NumeroRicevuta ?? ''),
    goodId: String(f.GoodId ?? ''),
    goodName: String(f.GoodName ?? ''),
    nome: String(f.Nome ?? ''),
    cognome: String(f.Cognome ?? ''),
    indirizzo: String(f.Indirizzo ?? ''),
    codiceFiscale: String(f.CodiceFiscale ?? ''),
    email: String(f.Email ?? ''),
    importo: Number(f.Importo ?? 0),
    data: String(f.Data ?? ''),
    metodo: String(f.Metodo ?? ''),
    stato: normalizeStatus(f.Stato),
    pdfUrl: String(f.PdfUrl ?? ''),
  }
}

export function normalizeStatus(raw: unknown): StatoPagamento {
  const s = String(raw ?? '').trim().toLowerCase()
  if (['pending', 'pending_paypal', 'pending_satispay', 'pending_bonifico', 'in_attesa'].includes(s))
    return 'pending'
  if (['paid', 'pagato'].includes(s)) return 'paid'
  if (['annullato', 'canceled', 'cancelled'].includes(s)) return 'annullato'
  if (['consegnato', 'delivered'].includes(s)) return 'consegnato'
  return 'pending'
}

// ============================================================
// BENI
// ============================================================

const BENE_SELECT =
  '$expand=fields($select=Title,Descrizione,Prezzo,Quantita,Venduti,Immagine,ImportoLibero,IdLogico)'

/** Catalogo completo (admin). */
export async function getBeni(): Promise<Bene[]> {
  const res = await graphGet<{ value: any[] }>(`${beniBase()}?${BENE_SELECT}&$top=500`)
  return res.value.map(mapBene)
}

/** Catalogo pubblico: solo beni con disponibilità > 0. */
export async function getBeniDisponibili(): Promise<Bene[]> {
  return (await getBeni()).filter((b) => b.available > 0)
}

export async function getBeneBySpId(spItemId: string): Promise<Bene | null> {
  try {
    const item = await graphGet<any>(`${beniBase()}/${spItemId}?${BENE_SELECT}`)
    return mapBene(item)
  } catch {
    return null
  }
}

export async function addBene(b: Partial<Bene>): Promise<Bene> {
  const fields = {
    Title: b.name ?? '',
    Descrizione: b.description ?? '',
    Prezzo: Number(b.price ?? 0),
    Quantita: Number(b.quantity ?? 0),
    Venduti: 0,
    Immagine: b.image ?? '',
    ImportoLibero: !!b.flexibleAmount,
    IdLogico: Date.now().toString(),
  }
  const created = await graphPost<any>(beniBase(), { fields })
  return (await getBeneBySpId(String(created.id)))!
}

export async function updateBene(spItemId: string, b: Partial<Bene>): Promise<void> {
  const fields: Record<string, unknown> = {}
  if (b.name !== undefined) fields.Title = b.name
  if (b.description !== undefined) fields.Descrizione = b.description
  if (b.price !== undefined) fields.Prezzo = Number(b.price)
  if (b.quantity !== undefined) fields.Quantita = Number(b.quantity)
  if (b.image !== undefined) fields.Immagine = b.image
  if (b.flexibleAmount !== undefined) fields.ImportoLibero = !!b.flexibleAmount
  await graphPatch(`${beniBase()}/${spItemId}/fields`, fields)
}

export async function deleteBene(spItemId: string): Promise<void> {
  await graphDelete(`${beniBase()}/${spItemId}`)
}

/**
 * Incrementa (delta=+1) o decrementa (delta=-1) il contatore Venduti con
 * concorrenza ottimistica: rilegge l'ETag e ritenta sul 412. Se delta>0
 * verifica anche che ci sia disponibilità residua.
 * Ritorna il bene aggiornato oppure lancia se esaurito / esauriti i retry.
 */
async function adjustVenduti(spItemId: string, delta: number): Promise<Bene> {
  const MAX_RETRY = 6
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    const item = await graphGet<any>(`${beniBase()}/${spItemId}?${BENE_SELECT}`)
    const etag = item['@odata.etag'] as string | undefined
    const bene = mapBene(item)
    if (delta > 0 && bene.available <= 0) {
      throw new Error('Bene esaurito')
    }
    const nuovoVenduti = Math.max(0, bene.venduti + delta)
    const { status } = await graphPatchStatus(
      `${beniBase()}/${spItemId}/fields`,
      { Venduti: nuovoVenduti },
      etag ? { 'If-Match': etag } : undefined
    )
    if (status === 412) continue // conflitto: qualcuno ha modificato → ritenta
    return { ...bene, venduti: nuovoVenduti, available: Math.max(0, bene.quantity - nuovoVenduti) }
  }
  throw new Error('Troppi tentativi concorrenti: riprova tra un istante')
}

// ============================================================
// PRENOTAZIONI
// ============================================================

const PREN_SELECT =
  '$expand=fields($select=Title,NumeroRicevuta,GoodId,GoodName,Nome,Cognome,Indirizzo,CodiceFiscale,Email,Importo,Data,Metodo,Stato,PdfUrl)'

export async function getPrenotazioni(): Promise<Prenotazione[]> {
  const res = await graphGet<{ value: any[] }>(
    `${prenBase()}?${PREN_SELECT}&$top=1000&$orderby=fields/Data desc`,
    PREFER_NON_INDEXED
  )
  return res.value.map(mapPrenotazione)
}

export async function getPrenotazioneBySpId(spItemId: string): Promise<Prenotazione | null> {
  try {
    return mapPrenotazione(await graphGet<any>(`${prenBase()}/${spItemId}?${PREN_SELECT}`))
  } catch {
    return null
  }
}

/**
 * Crea una prenotazione dopo aver validato importo e disponibilità e aver
 * riservato il pezzo (Venduti+1 con concorrenza ottimistica).
 * In v1 il metodo attivo è "bonifico" (stato pending).
 */
export async function creaPrenotazione(
  p: NuovaPrenotazione
): Promise<{ prenotazione: Prenotazione } | { error: string }> {
  const bene = await getBeneBySpId(p.goodId)
  if (!bene) return { error: 'Bene non trovato' }

  const importo = Number(p.importo)
  if (!importo || importo <= 0) return { error: 'Importo non valido' }
  if (bene.flexibleAmount && importo < bene.price) {
    return { error: `Importo minimo: € ${bene.price.toFixed(2)}` }
  }
  if (!bene.flexibleAmount && Math.abs(importo - bene.price) > 0.001) {
    return { error: 'Importo non coerente con il bene selezionato' }
  }
  if (bene.available <= 0) return { error: 'Bene esaurito' }

  // Riserva il pezzo (può lanciare "Bene esaurito" in caso di corsa concorrente)
  try {
    await adjustVenduti(p.goodId, +1)
  } catch (e: any) {
    return { error: e?.message || 'Impossibile riservare il bene' }
  }

  try {
    const id = Date.now().toString()
    const fields = {
      Title: id,
      NumeroRicevuta: '',
      GoodId: bene.id,
      GoodName: bene.name,
      Nome: p.nome,
      Cognome: p.cognome,
      Indirizzo: p.indirizzo,
      CodiceFiscale: p.codiceFiscale.toUpperCase(),
      Email: p.email,
      Importo: importo,
      Data: new Date().toISOString(),
      Metodo: p.metodo,
      Stato: 'pending',
    }
    const created = await graphPost<any>(prenBase(), { fields })
    const pren = (await getPrenotazioneBySpId(String(created.id)))!
    return { prenotazione: pren }
  } catch (e: any) {
    // Rollback della riserva se la scrittura fallisce
    await adjustVenduti(p.goodId, -1).catch(() => {})
    return { error: e?.message || 'Errore nella creazione della prenotazione' }
  }
}

/** Numero ricevuta progressivo: RIC-<anno>-AMZ-<0000>. */
export async function prossimoNumeroRicevuta(): Promise<string> {
  const anno = new Date().getFullYear()
  const prens = await getPrenotazioni()
  let max = 0
  for (const p of prens) {
    const m = p.numeroRicevuta.match(/AMZ-(\d+)/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `RIC-${anno}-AMZ-${String(max + 1).padStart(4, '0')}`
}

/** Aggiorna stato e (opzionale) numero ricevuta / url pdf. */
export async function aggiornaPrenotazione(
  spItemId: string,
  fields: { Stato?: string; NumeroRicevuta?: string; PdfUrl?: string }
): Promise<void> {
  await graphPatch(`${prenBase()}/${spItemId}/fields`, fields)
}

/**
 * Cambia stato prenotazione. Se si passa a "annullato" da uno stato attivo,
 * libera il pezzo (Venduti-1).
 */
export async function cambiaStato(
  spItemId: string,
  nuovoStato: StatoPagamento
): Promise<Prenotazione | { error: string }> {
  const pren = await getPrenotazioneBySpId(spItemId)
  if (!pren) return { error: 'Prenotazione non trovata' }

  const eraAttiva = pren.stato !== 'annullato'
  await aggiornaPrenotazione(spItemId, { Stato: nuovoStato })

  if (nuovoStato === 'annullato' && eraAttiva) {
    const bene = await getBeneByLogicalId(pren.goodId)
    if (bene) await adjustVenduti(bene.spItemId, -1).catch(() => {})
  }
  return (await getPrenotazioneBySpId(spItemId))!
}

export async function eliminaPrenotazione(spItemId: string): Promise<void> {
  await graphDelete(`${prenBase()}/${spItemId}`)
}

/** Trova un bene dal suo id logico (usato per aggiornare Venduti da una prenotazione). */
async function getBeneByLogicalId(logicalId: string): Promise<Bene | null> {
  const beni = await getBeni()
  return beni.find((b) => b.id === logicalId) ?? null
}

// ============================================================
// AMMINISTRATORI (lista SharePoint, colonna Title = email)
// ============================================================

export interface Amministratore {
  spItemId: string
  email: string
}

/** Emails admin dal seme env ADMIN_EMAILS (sempre valido, per il bootstrap). */
export function adminEmailsSeed(): string[] {
  return (process.env.ADMIN_EMAILS || 'dennis.maseri@cooperativamirafiori.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/** Emails admin dalla lista SharePoint (vuoto se lista non configurata o errore). */
export async function getAdminEmailsFromList(): Promise<string[]> {
  if (!ADMIN()) return []
  try {
    const res = await graphGet<{ value: any[] }>(
      `${adminBase()}?$expand=fields($select=Title)&$top=200`,
      PREFER_NON_INDEXED
    )
    return res.value
      .map((i) => String(i.fields?.Title ?? '').trim().toLowerCase())
      .filter(Boolean)
  } catch {
    return []
  }
}

/** True se l'email è admin: unione tra seme env e lista SharePoint. */
export async function isAdmin(email: string): Promise<boolean> {
  const e = email.trim().toLowerCase()
  if (adminEmailsSeed().includes(e)) return true
  return (await getAdminEmailsFromList()).includes(e)
}

/** Elenco admin gestibili dall'UI (solo quelli in lista; il seme env è fisso). */
export async function listAdmins(): Promise<Amministratore[]> {
  if (!ADMIN()) return []
  const res = await graphGet<{ value: any[] }>(
    `${adminBase()}?$expand=fields($select=Title)&$top=200`,
    PREFER_NON_INDEXED
  )
  return res.value
    .map((i) => ({ spItemId: String(i.id), email: String(i.fields?.Title ?? '').trim() }))
    .filter((a) => a.email)
}

/** Aggiunge un admin alla lista (idempotente sull'email). */
export async function addAdmin(email: string): Promise<Amministratore | { error: string }> {
  if (!ADMIN()) return { error: 'Lista amministratori non configurata (SP_LIST_ADMIN mancante)' }
  const e = email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { error: 'Email non valida' }
  const esistenti = await listAdmins()
  const gia = esistenti.find((a) => a.email.toLowerCase() === e)
  if (gia) return gia
  const created = await graphPost<any>(adminBase(), { fields: { Title: e } })
  return { spItemId: String(created.id), email: e }
}

export async function removeAdmin(spItemId: string): Promise<void> {
  if (!ADMIN()) return
  await graphDelete(`${adminBase()}/${spItemId}`)
}
