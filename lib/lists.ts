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
 *                 Immagine, ImportoLibero(yes/no), IdLogico,
 *                 Canale (testo: vuoto = Amazing, "MIR" = pagina /dona),
 *                 Sezione (testo: vuoto = catalogo, "NATALE" = pagina /natale),
 *                 Taglie, VendutiTaglie (testo JSON, scorta per taglia),
 *                 Varianti, VendutiVarianti (testo JSON, spille: scorta per soggetto|misura)
 *   Prenotazioni: Title(id logico), NumeroRicevuta, GoodId, GoodName, Nome,
 *                 Cognome, Indirizzo, CodiceFiscale, Email, Importo, Data,
 *                 Metodo, Stato, Consegnato(yes/no), PdfUrl,
 *                 Taglia (testo), Pezzi (numero, vuoto = 1),
 *                 Righe (testo JSON, righe degli ordini di spille),
 *                 PresaVisioneInformativa(yes/no), DataOraPresaVisione(data/ora),
 *                 VersioneInformativa (testo, es. "INF08 v1.0")
 *
 * Stato pagamento (Stato) e stato consegna (Consegnato) sono due colonne
 * indipendenti: Stato riguarda solo il pagamento (auto per paypal/satispay,
 * manuale per bonifico), Consegnato è un semplice flag impostato a mano
 * dall'operatore quando il bene viene ritirato/consegnato.
 */

import {
  graphGet,
  graphPost,
  graphPatch,
  graphPatchStatus,
  graphDelete,
} from '@/lib/graph'
import type { Bene, Prenotazione, NuovaPrenotazione, StatoPagamento } from '@/types'
import { normalizzaSerie, serieDaNumero, SERIE_DEFAULT, type Serie } from '@/lib/serie'
import { INFORMATIVA } from '@/lib/informativa'
import {
  TAGLIE,
  leggiTaglie,
  scriviTaglie,
  sommaTaglie,
  normalizzaSezione,
  isTaglia,
  NATALE,
  type ScortaTaglie,
  type Taglia,
} from '@/lib/natale'
import {
  leggiVarianti,
  scriviVarianti,
  sommaVarianti,
  leggiRighe,
  componiRighe,
  totaleRighe,
  infoVariante,
  SPILLE,
  type ScortaVarianti,
  type RigaRichiesta,
} from '@/lib/spille'

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
  const canale = normalizzaSerie(f.Canale)
  const taglie = leggiTaglie(f.Taglie)
  const vendutiTaglie = leggiTaglie(f.VendutiTaglie) ?? {}
  // Spille: scorta per soggetto|misura. Le taglie hanno la precedenza (un
  // bene non ha mai entrambe).
  const varianti = taglie ? null : leggiVarianti(f.Varianti)
  const vendutiVarianti = leggiVarianti(f.VendutiVarianti) ?? {}
  // Con taglie o varianti la scorta e i venduti "veri" sono quelli di dettaglio;
  // Quantita/Venduti sono tenuti allineati alle somme (vedi adjustVenduti).
  const quantity = taglie
    ? sommaTaglie(taglie)
    : varianti
    ? sommaVarianti(varianti)
    : Number(f.Quantita ?? 0)
  const venduti = taglie
    ? sommaTaglie(vendutiTaglie)
    : varianti
    ? sommaVarianti(vendutiVarianti)
    : Number(f.Venduti ?? 0)
  const disponibiliVarianti: ScortaVarianti = {}
  if (varianti) {
    for (const [k, n] of Object.entries(varianti))
      disponibiliVarianti[k] = Math.max(0, n - (vendutiVarianti[k] ?? 0))
  }
  const disponibiliTaglie: ScortaTaglie = {}
  if (taglie) {
    for (const t of TAGLIE) {
      if (taglie[t] !== undefined) disponibiliTaglie[t] = Math.max(0, taglie[t]! - (vendutiTaglie[t] ?? 0))
    }
  }
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
    canale,
    // La vetrina Natale esiste solo dentro Amazing: un progetto MIR non ci finisce.
    sezione: canale === 'AMZ' ? normalizzaSezione(f.Sezione) : 'AMAZING',
    taglie,
    vendutiTaglie,
    disponibiliTaglie,
    varianti,
    vendutiVarianti,
    disponibiliVarianti,
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
    consegnato: normalizeConsegnato(f),
    pdfUrl: String(f.PdfUrl ?? ''),
    satispayPaymentId: String(f.SatispayPaymentId ?? ''),
    satispayStatus: String(f.SatispayStatus ?? ''),
    paypalOrderId: String(f.PaypalOrderId ?? ''),
    taglia: String(f.Taglia ?? ''),
    pezzi: Math.max(1, Math.floor(Number(f.Pezzi ?? 1)) || 1),
    righe: leggiRighe(f.Righe),
  }
}

export function normalizeStatus(raw: unknown): StatoPagamento {
  const s = String(raw ?? '').trim().toLowerCase()
  if (['pending', 'pending_paypal', 'pending_satispay', 'pending_bonifico', 'in_attesa'].includes(s))
    return 'pending'
  // "consegnato"/"delivered" sono valori storici dello Stato (quando consegna e
  // pagamento erano un unico campo): implicano che il pagamento era completato.
  if (['paid', 'pagato', 'consegnato', 'delivered'].includes(s)) return 'paid'
  if (['annullato', 'canceled', 'cancelled'].includes(s)) return 'annullato'
  return 'pending'
}

/**
 * Stato consegna: colonna dedicata `Consegnato` (Sì/No). Per compatibilità con
 * i dati storici, se manca la colonna ma lo Stato legacy era "consegnato" /
 * "delivered", il bene si considera già consegnato.
 */
function normalizeConsegnato(f: Record<string, unknown>): boolean {
  const v = f.Consegnato
  if (v === true) return true
  if (typeof v === 'string' && v.trim().toLowerCase() === 'true') return true
  const legacyStato = String(f.Stato ?? '').trim().toLowerCase()
  return legacyStato === 'consegnato' || legacyStato === 'delivered'
}

// ============================================================
// BENI
// ============================================================

const BENE_SELECT =
  '$expand=fields($select=Title,Descrizione,Prezzo,Quantita,Venduti,Immagine,ImportoLibero,IdLogico,Canale,Sezione,Taglie,VendutiTaglie,Varianti,VendutiVarianti)'

/**
 * Ordine di visualizzazione del catalogo:
 * 1. i beni a **importo libero** (es. "Donazione Libera") sempre in testa;
 * 2. poi tutti gli altri dal **più recente al più vecchio**.
 *
 * L'anzianità si ricava dall'ID item SharePoint, che è monotono crescente:
 * un bene appena aggiunto ha sempre l'ID più alto della lista.
 */
export function ordinaCatalogo(beni: Bene[]): Bene[] {
  return [...beni].sort((a, b) => {
    if (a.flexibleAmount !== b.flexibleAmount) return a.flexibleAmount ? -1 : 1
    return Number(b.spItemId) - Number(a.spItemId)
  })
}

/** Catalogo completo (admin), già ordinato per visualizzazione. */
export async function getBeni(): Promise<Bene[]> {
  const res = await graphGet<{ value: any[] }>(`${beniBase()}?${BENE_SELECT}&$top=500`)
  return ordinaCatalogo(res.value.map(mapBene))
}

/**
 * Catalogo pubblico Amazing: solo beni con disponibilità > 0 e del canale
 * Amazing. I progetti della pagina /dona (canale MIR) e i prodotti della
 * vetrina Natale non compaiono qui.
 */
export async function getBeniDisponibili(): Promise<Bene[]> {
  return (await getBeni()).filter(inCatalogo)
}

/** Prodotti della vetrina Natale ancora disponibili (pagina /natale). */
export async function getBeniNatale(): Promise<Bene[]> {
  return (await getBeni()).filter(inVetrinaNatale)
}

export const inCatalogo = (b: Bene) =>
  b.available > 0 && b.canale === 'AMZ' && b.sezione === 'AMAZING'
export const inVetrinaNatale = (b: Bene) =>
  b.available > 0 && b.canale === 'AMZ' && b.sezione === 'NATALE'

/**
 * Progetti/servizi della pagina /dona (canale MIR) ancora attivi, dal più
 * vecchio al più nuovo: il primo creato ("Dove serve di più") resta in testa.
 */
export async function getProgettiDona(): Promise<Bene[]> {
  return (await getBeni())
    .filter((b) => b.canale === 'MIR' && b.available > 0)
    .sort((a, b) => Number(a.spItemId) - Number(b.spItemId))
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
    // Vuoto = Amazing: così i beni creati prima della colonna e quelli nuovi
    // del catalogo si comportano allo stesso modo.
    Canale: b.canale === 'MIR' ? 'MIR' : '',
    ...campiNatale(b),
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
  if (b.canale !== undefined) fields.Canale = b.canale === 'MIR' ? 'MIR' : ''
  Object.assign(fields, campiNatale(b))
  await graphPatch(`${beniBase()}/${spItemId}/fields`, fields)
}

/**
 * Colonne della vetrina Natale da scrivere su un bene. Si scrivono solo se
 * il chiamante le ha passate (o se il bene è di Natale), così i beni classici
 * non toccano colonne che su un ambiente non aggiornato potrebbero mancare.
 * Con le taglie, `Quantita` diventa la somma delle scorte per taglia.
 * `VendutiTaglie` non si tocca da qui: lo gestisce adjustVenduti.
 */
function campiNatale(b: Partial<Bene>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (b.sezione !== undefined)
    out.Sezione = b.sezione === 'NATALE' && b.canale !== 'MIR' ? 'NATALE' : ''
  if (b.taglie !== undefined) {
    // leggiTaglie ripulisce anche quello che arriva grezzo dal body della API.
    const taglie = leggiTaglie(b.taglie)
    out.Taglie = scriviTaglie(taglie)
    if (taglie) out.Quantita = sommaTaglie(taglie)
  }
  if (b.varianti !== undefined) {
    const varianti = leggiVarianti(b.varianti)
    out.Varianti = scriviVarianti(varianti)
    if (varianti) out.Quantita = sommaVarianti(varianti)
  }
  return out
}

export async function deleteBene(spItemId: string): Promise<void> {
  await graphDelete(`${beniBase()}/${spItemId}`)
}

/**
 * Incrementa (delta>0, riserva) o decrementa (delta<0, rilascia) il contatore
 * Venduti di `|delta|` pezzi con concorrenza ottimistica: rilegge l'ETag e
 * ritenta sul 412. Se delta>0 verifica anche che ci sia disponibilità residua.
 *
 * Prodotti con taglie (vetrina Natale): aggiorna anche `VendutiTaglie` per la
 * taglia indicata, nella stessa scrittura protetta da ETag, e tiene `Venduti`
 * allineato alla somma. Se il bene ha le taglie la taglia è obbligatoria per
 * riservare; in rilascio, senza taglia valida si scala solo il totale.
 *
 * Ritorna il bene aggiornato oppure lancia se esaurito / esauriti i retry.
 */
async function adjustVenduti(spItemId: string, delta: number, taglia?: string): Promise<Bene> {
  const MAX_RETRY = 6
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    const item = await graphGet<any>(`${beniBase()}/${spItemId}?${BENE_SELECT}`)
    const etag = item['@odata.etag'] as string | undefined
    const bene = mapBene(item)
    const fields: Record<string, unknown> = {}

    const t = isTaglia(taglia) ? taglia : null
    if (bene.taglie && t && bene.taglie[t] !== undefined) {
      if (delta > 0 && (bene.disponibiliTaglie[t] ?? 0) < delta) {
        throw new Error(
          (bene.disponibiliTaglie[t] ?? 0) <= 0
            ? `Taglia ${t} esaurita`
            : `Taglia ${t}: disponibili solo ${bene.disponibiliTaglie[t]} pezzi`
        )
      }
      const vt: ScortaTaglie = { ...bene.vendutiTaglie }
      vt[t] = Math.max(0, (vt[t] ?? 0) + delta)
      fields.VendutiTaglie = scriviTaglie(vt)
      fields.Venduti = sommaTaglie(vt)
    } else {
      if (delta > 0 && bene.taglie) throw new Error('Scegli una taglia disponibile')
      if (delta > 0 && bene.available < delta) {
        throw new Error(
          bene.available <= 0 ? 'Bene esaurito' : `Disponibili solo ${bene.available} pezzi`
        )
      }
      fields.Venduti = Math.max(0, bene.venduti + delta)
    }

    const { status } = await graphPatchStatus(
      `${beniBase()}/${spItemId}/fields`,
      fields,
      etag ? { 'If-Match': etag } : undefined
    )
    if (status === 412) continue // conflitto: qualcuno ha modificato → ritenta
    return (await getBeneBySpId(spItemId)) ?? bene
  }
  throw new Error('Troppi tentativi concorrenti: riprova tra un istante')
}

/**
 * Beni a varianti (spille): riserva (segno +1) o rilascia (segno −1) i pezzi di
 * tutte le righe in UNA sola scrittura protetta da ETag. In riserva o passano
 * tutte le righe o nessuna: se anche una sola variante non basta, non si
 * scrive niente. Tiene `Venduti` allineato alla somma.
 */
async function adjustVarianti(
  spItemId: string,
  righe: RigaRichiesta[],
  segno: 1 | -1
): Promise<Bene> {
  const MAX_RETRY = 6
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    const item = await graphGet<any>(`${beniBase()}/${spItemId}?${BENE_SELECT}`)
    const etag = item['@odata.etag'] as string | undefined
    const bene = mapBene(item)
    if (!bene.varianti) throw new Error('Il prodotto non ha varianti')

    const vv: ScortaVarianti = { ...bene.vendutiVarianti }
    for (const r of righe) {
      if (segno > 0) {
        if (bene.varianti[r.chiave] === undefined) throw new Error('Spilla non disponibile')
        const disp = bene.disponibiliVarianti[r.chiave] ?? 0
        if (disp < r.pezzi) {
          const info = infoVariante(r.chiave)
          const nome = info ? `${info.soggetto.nome} ${info.misura.nome.toLowerCase()}` : r.chiave
          throw new Error(disp <= 0 ? `${nome}: esaurita` : `${nome}: disponibili solo ${disp}`)
        }
      }
      vv[r.chiave] = Math.max(0, (vv[r.chiave] ?? 0) + segno * r.pezzi)
    }

    const { status } = await graphPatchStatus(
      `${beniBase()}/${spItemId}/fields`,
      { VendutiVarianti: scriviVarianti(vv), Venduti: sommaVarianti(vv) },
      etag ? { 'If-Match': etag } : undefined
    )
    if (status === 412) continue
    return (await getBeneBySpId(spItemId)) ?? bene
  }
  throw new Error('Troppi tentativi concorrenti: riprova tra un istante')
}

/** Rilascia i pezzi riservati da una prenotazione (tutti, della sua taglia o delle sue righe). */
async function rilasciaPezzi(
  beneSpItemId: string,
  pren: { pezzi?: number; taglia?: string; righe?: RigaRichiesta[] }
) {
  if (pren.righe?.length) return adjustVarianti(beneSpItemId, pren.righe, -1)
  return adjustVenduti(beneSpItemId, -Math.max(1, pren.pezzi ?? 1), pren.taglia || undefined)
}

// ============================================================
// PRENOTAZIONI
// ============================================================

const PREN_SELECT =
  '$expand=fields($select=Title,NumeroRicevuta,GoodId,GoodName,Nome,Cognome,Indirizzo,CodiceFiscale,Email,Importo,Data,Metodo,Stato,Consegnato,PdfUrl,SatispayPaymentId,SatispayStatus,PaypalOrderId,Taglia,Pezzi,Righe)'

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
 * riservato i pezzi (Venduti+N con concorrenza ottimistica; N>1 e taglia solo
 * per la vetrina Natale).
 * In v1 il metodo attivo è "bonifico" (stato pending).
 */
export async function creaPrenotazione(
  p: NuovaPrenotazione
): Promise<{ prenotazione: Prenotazione; serie: Serie } | { error: string }> {
  const bene = await getBeneBySpId(p.goodId)
  if (!bene) return { error: 'Bene non trovato' }
  // Enti e aziende possono donare solo dalla pagina /dona (serie MIR).
  if (p.tipoDonatore === 'giuridica' && bene.canale !== 'MIR') {
    return { error: 'Le donazioni di enti e aziende sono possibili solo dalla pagina Donazioni' }
  }

  // Vetrina Natale: più pezzi dello stesso prodotto e taglia. Altrove sempre 1.
  const natale = bene.sezione === 'NATALE'

  // Spille (bene a varianti): l'ordine è fatto di righe soggetto|misura.
  const richiesta: RigaRichiesta[] = bene.varianti ? p.righe ?? [] : []
  if (bene.varianti) {
    if (!richiesta.length) return { error: 'Scegli almeno una spilla' }
    for (const r of richiesta) {
      if (bene.varianti[r.chiave] === undefined) return { error: 'Spilla non disponibile' }
      const disp = bene.disponibiliVarianti[r.chiave] ?? 0
      if (disp < r.pezzi) {
        const info = infoVariante(r.chiave)!
        const nome = `${info.soggetto.nome} ${info.misura.nome.toLowerCase()}`
        return { error: disp <= 0 ? `${nome}: esaurita` : `${nome}: disponibili solo ${disp}` }
      }
    }
  }
  const righe = componiRighe(richiesta)
  const maxPezzi = bene.varianti ? SPILLE.maxPezzi : NATALE.maxPezzi
  const pezzi = bene.varianti
    ? richiesta.reduce((s, r) => s + r.pezzi, 0)
    : natale
    ? Math.floor(Number(p.pezzi ?? 1))
    : 1
  if (!Number.isInteger(pezzi) || pezzi < 1 || pezzi > maxPezzi) {
    return { error: `Numero di pezzi non valido (da 1 a ${maxPezzi})` }
  }
  let taglia: Taglia | '' = ''
  if (bene.taglie) {
    if (!isTaglia(p.taglia) || bene.taglie[p.taglia] === undefined) {
      return { error: 'Scegli una taglia disponibile' }
    }
    taglia = p.taglia
    if ((bene.disponibiliTaglie[taglia] ?? 0) < pezzi) {
      const disp = bene.disponibiliTaglie[taglia] ?? 0
      return { error: disp <= 0 ? `Taglia ${taglia} esaurita` : `Taglia ${taglia}: disponibili solo ${disp} pezzi` }
    }
  }

  // La donazione minima (o fissa) vale per pezzo; per le spille dipende
  // dalla misura di ogni riga.
  const minimo = bene.varianti ? totaleRighe(righe) : Math.round(bene.price * pezzi * 100) / 100
  const importo = Number(p.importo)
  if (!importo || importo <= 0) return { error: 'Importo non valido' }
  if (bene.flexibleAmount && importo < minimo - 0.001) {
    return { error: `Importo minimo: € ${minimo.toFixed(2)}` }
  }
  if (!bene.flexibleAmount && Math.abs(importo - minimo) > 0.001) {
    return { error: 'Importo non coerente con il bene selezionato' }
  }
  if (bene.available < pezzi) {
    return { error: bene.available <= 0 ? 'Bene esaurito' : `Disponibili solo ${bene.available} pezzi` }
  }

  // Riserva i pezzi (può lanciare "esaurito" in caso di corsa concorrente)
  try {
    if (bene.varianti) await adjustVarianti(p.goodId, richiesta, +1)
    else await adjustVenduti(p.goodId, +pezzi, taglia || undefined)
  } catch (e: any) {
    return { error: e?.message || 'Impossibile riservare il bene' }
  }

  try {
    const id = Date.now().toString()
    const adesso = new Date().toISOString()
    const fields = {
      Title: id,
      NumeroRicevuta: '',
      GoodId: bene.id,
      GoodName: bene.name,
      Nome: p.nome,
      Cognome: p.tipoDonatore === 'giuridica' ? '' : p.cognome,
      Indirizzo: p.indirizzo,
      CodiceFiscale: p.codiceFiscale.toUpperCase(),
      Email: p.email,
      Importo: importo,
      Data: adesso,
      Metodo: p.metodo,
      Stato: 'pending',
      // Prova della presa visione dell'informativa: sempre Sì, perché senza
      // la spunta il modulo non parte (validaPrenotazione).
      PresaVisioneInformativa: true,
      DataOraPresaVisione: adesso,
      VersioneInformativa: INFORMATIVA.versione,
      // Colonne Natale scritte solo per i prodotti della vetrina: i beni
      // classici restano identici a prima.
      ...(natale ? { Taglia: taglia, Pezzi: pezzi } : {}),
      ...(righe.length ? { Righe: JSON.stringify(righe) } : {}),
    }
    const created = await graphPost<any>(prenBase(), { fields })
    const spItemId = String(created.id)
    // Bonifico e Satispay: il numero ricevuta si assegna SUBITO. Per il bonifico
    // il donatore lo mette nella causale e l'operatore può abbinare il bonifico
    // alla prenotazione; per Satispay diventa l'external_code del pagamento, così
    // in app Satispay e nel portale Business compare RIC-… invece dell'id interno.
    // Alla conferma del pagamento `completaPagamento` riusa questo numero.
    // Se l'assegnazione fallisce la prenotazione resta valida: il numero verrà
    // assegnato alla conferma (e la causale usa l'id come ripiego).
    if (p.metodo === 'bonifico' || p.metodo === 'satispay') {
      await assegnaNumeroRicevuta(spItemId, bene.canale).catch((err) =>
        console.error('[creaPrenotazione] assegnazione numero ricevuta fallita:', err)
      )
    }
    const pren = (await getPrenotazioneBySpId(spItemId))!
    return { prenotazione: pren, serie: bene.canale }
  } catch (e: any) {
    // Rollback della riserva se la scrittura fallisce
    await rilasciaPezzi(p.goodId, { pezzi, taglia, righe: richiesta }).catch(() => {})
    return { error: e?.message || 'Errore nella creazione della prenotazione' }
  }
}

/**
 * Numero ricevuta progressivo della serie indicata: RIC-<anno>-<serie>-<0000>.
 * Ogni serie (AMZ, MIR) ha il suo contatore indipendente.
 */
export async function prossimoNumeroRicevuta(serie: Serie = SERIE_DEFAULT): Promise<string> {
  const anno = new Date().getFullYear()
  const prens = await getPrenotazioni()
  const re = new RegExp(`-${serie}-(\\d+)`)
  let max = 0
  for (const p of prens) {
    const m = p.numeroRicevuta.match(re)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `RIC-${anno}-${serie}-${String(max + 1).padStart(4, '0')}`
}

/**
 * Serie a cui appartiene una prenotazione: dal numero ricevuta se già
 * assegnato, altrimenti dal canale del bene. Se il bene non si trova più
 * (cancellato dal catalogo) si resta su Amazing, il comportamento storico.
 */
export async function serieDiPrenotazione(p: Prenotazione): Promise<Serie> {
  const daNumero = serieDaNumero(p.numeroRicevuta)
  if (daNumero) return daNumero
  const bene = await getBeneByLogicalId(p.goodId).catch(() => null)
  return bene?.canale ?? SERIE_DEFAULT
}

/**
 * Assegna un numero ricevuta univoco a una prenotazione appena creata.
 *
 * Due bonifici creati nello stesso istante leggerebbero lo stesso "max" e
 * prenderebbero lo stesso numero. Dopo la scrittura si ricontrolla: se un'altra
 * prenotazione ha lo stesso numero e un id SharePoint più basso (è arrivata
 * prima), cede lei il numero e si ritenta con il successivo.
 */
export async function assegnaNumeroRicevuta(
  spItemId: string,
  serie: Serie = SERIE_DEFAULT
): Promise<string> {
  for (let tentativo = 0; tentativo < 5; tentativo++) {
    const numero = await prossimoNumeroRicevuta(serie)
    await aggiornaPrenotazione(spItemId, { NumeroRicevuta: numero })
    const doppioni = (await getPrenotazioni()).filter(
      (x) => x.numeroRicevuta === numero && x.spItemId !== spItemId
    )
    if (!doppioni.some((x) => Number(x.spItemId) < Number(spItemId))) return numero
  }
  throw new Error('Impossibile assegnare un numero ricevuta univoco')
}

/**
 * Marca la prenotazione come pagata **vincendo una corsa**: scrive
 * `Stato = paid` + `NumeroRicevuta` con `If-Match` sull'ETag dell'item.
 *
 * Serve perché su Satispay `finalize` (ritorno dell'utente nel browser) e
 * `callback` (server-to-server) partono praticamente nello stesso istante: è il
 * caso normale, non un caso limite. Con un semplice "leggi lo stato e poi
 * scrivi" entrambe le chiamate passerebbero il controllo e genererebbero due
 * ricevute con due numeri diversi.
 *
 * Ritorna:
 *  - `{ vinto: true }`  → chi ha chiamato è il proprietario della transizione e
 *                         deve procedere con PDF, email e archiviazione;
 *  - `{ vinto: false }` → un altro processo (o una chiamata precedente) ha già
 *                         segnato il pagamento: non fare nulla, la ricevuta è
 *                         già stata gestita. `numeroRicevuta` è quello vincente.
 *
 * Sul 412 (ETag cambiato) si rilegge una volta per riportare il numero vincente
 * invece di ritentare: se qualcuno ha scritto in mezzo, la transizione a `paid`
 * è la sua e va rispettata.
 */
export async function marcaPagata(
  spItemId: string,
  numeroRicevuta: string
): Promise<{ vinto: boolean; numeroRicevuta: string }> {
  const item = await graphGet<any>(`${prenBase()}/${spItemId}?${PREN_SELECT}`)
  const pren = mapPrenotazione(item)

  // Già pagata: nessuna corsa da vincere.
  if (pren.stato === 'paid') {
    return { vinto: false, numeroRicevuta: pren.numeroRicevuta || numeroRicevuta }
  }

  const etag = item['@odata.etag'] as string | undefined
  const { status } = await graphPatchStatus(
    `${prenBase()}/${spItemId}/fields`,
    { Stato: 'paid', NumeroRicevuta: pren.numeroRicevuta || numeroRicevuta },
    etag ? { 'If-Match': etag } : undefined
  )

  if (status === 412) {
    const dopo = await getPrenotazioneBySpId(spItemId)
    return {
      vinto: false,
      numeroRicevuta: dopo?.numeroRicevuta || numeroRicevuta,
    }
  }

  return { vinto: true, numeroRicevuta: pren.numeroRicevuta || numeroRicevuta }
}

/** Aggiorna stato e (opzionale) numero ricevuta / url pdf / dati pagamento. */
export async function aggiornaPrenotazione(
  spItemId: string,
  fields: {
    Stato?: string
    Consegnato?: boolean
    NumeroRicevuta?: string
    PdfUrl?: string
    SatispayPaymentId?: string
    SatispayStatus?: string
    PaypalOrderId?: string
  }
): Promise<void> {
  await graphPatch(`${prenBase()}/${spItemId}/fields`, fields)
}

/** Trova una prenotazione dal suo Satispay payment id (per la callback S2S). */
export async function getPrenotazioneBySatispayPaymentId(
  paymentId: string
): Promise<Prenotazione | null> {
  if (!paymentId) return null
  const res = await graphGet<{ value: any[] }>(
    `${prenBase()}?${PREN_SELECT}&$top=1000`,
    PREFER_NON_INDEXED
  )
  const found = res.value
    .map(mapPrenotazione)
    .find((p) => p.satispayPaymentId === String(paymentId))
  return found ?? null
}

/**
 * Rilascia il pezzo riservato da una prenotazione non pagata (Venduti-1) e la
 * annulla. Usato quando Satispay/PayPal riportano il pagamento come annullato.
 *
 * Non lancia, ma **segnala** se il decremento di Venduti è fallito: prima
 * l'errore veniva ingoiato con `.catch(() => {})` e il pezzo restava bloccato
 * senza che nessuno lo sapesse.
 */
export async function annullaERilascia(
  spItemId: string
): Promise<{ rilasciato: boolean; avviso?: string }> {
  const pren = await getPrenotazioneBySpId(spItemId)
  if (!pren) return { rilasciato: false, avviso: 'Prenotazione non trovata' }

  let rilasciato = false
  let avviso: string | undefined

  if (pren.stato !== 'annullato') {
    const bene = await getBeneByLogicalId(pren.goodId)
    if (!bene) {
      avviso = `Bene ${pren.goodId} non trovato: disponibilità NON ripristinata`
    } else {
      try {
        await rilasciaPezzi(bene.spItemId, pren)
        rilasciato = true
      } catch (err: any) {
        avviso = `Disponibilità di "${bene.name}" NON ripristinata: ${err?.message ?? err}`
      }
    }
  }

  await aggiornaPrenotazione(spItemId, { Stato: 'annullato' })
  if (avviso) console.error('[annullaERilascia]', spItemId, avviso)
  return { rilasciato, avviso }
}

/**
 * Prenotazioni ancora `pending` con pagamento online (PayPal/Satispay) più
 * vecchie di `minuti`, cioè quelle che tengono bloccato un pezzo senza che il
 * pagamento sia mai stato confermato.
 *
 * I **bonifici** sono esclusi di proposito: per loro è corretto che la
 * prenotazione resti in sospeso finché non arriva il denaro e un operatore
 * conferma a mano.
 */
export async function getPendingDaVerificare(minuti: number): Promise<Prenotazione[]> {
  const limite = Date.now() - minuti * 60_000
  return (await getPrenotazioni()).filter((p) => {
    if (p.stato !== 'pending') return false
    if (p.metodo !== 'paypal' && p.metodo !== 'satispay') return false
    const t = new Date(p.data).getTime()
    // Senza data valida non si può dire se è scaduta: meglio lasciarla stare.
    return !isNaN(t) && t < limite
  })
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
    if (bene) await rilasciaPezzi(bene.spItemId, pren).catch(() => {})
  }
  return (await getPrenotazioneBySpId(spItemId))!
}

/**
 * Segna/annulla la consegna del bene. Indipendente dallo Stato di pagamento:
 * è un flag impostato a mano dall'operatore quando il donatore ritira il bene.
 */
export async function cambiaConsegna(
  spItemId: string,
  consegnato: boolean
): Promise<Prenotazione | { error: string }> {
  const pren = await getPrenotazioneBySpId(spItemId)
  if (!pren) return { error: 'Prenotazione non trovata' }
  await aggiornaPrenotazione(spItemId, { Consegnato: consegnato })
  return (await getPrenotazioneBySpId(spItemId))!
}

export async function eliminaPrenotazione(spItemId: string): Promise<void> {
  await graphDelete(`${prenBase()}/${spItemId}`)
}

/**
 * Valori GREZZI della colonna Stato che indicano una donazione non
 * perfezionata. Si guarda il valore grezzo, non `normalizeStatus`, perché
 * quest'ultimo tratta come "pending" anche valori vuoti o sconosciuti: una riga
 * con uno stato strano non deve mai essere cancellata in automatico.
 */
const STATI_NON_PERFEZIONATI = new Set([
  'pending',
  'pending_paypal',
  'pending_satispay',
  'pending_bonifico',
  'in_attesa',
  'annullato',
  'canceled',
  'cancelled',
])

export type EsitoPulizia = {
  mesi: number
  trovate: number
  eliminate: number
  restanti: number
  errori: number
}

/**
 * Conservazione (informativa INF08, punto 5): i moduli per cui la donazione non
 * risulta perfezionata vanno cancellati entro 6 mesi dalla compilazione.
 * Elimina le prenotazioni (Amazing e /dona) con Stato pending/annullato e Data
 * più vecchia di `mesi`. Le donazioni pagate (Stato = paid) non si toccano mai:
 * si conservano 10 anni. Se una riga pending teneva riservato un pezzo, il pezzo
 * viene liberato prima della cancellazione.
 *
 * Nessun dato personale nei log: solo conteggi.
 */
export async function eliminaModuliNonPerfezionati(
  mesi = 6,
  maxPerGiro = 50
): Promise<EsitoPulizia> {
  const limite = new Date()
  limite.setMonth(limite.getMonth() - mesi)

  const res = await graphGet<{ value: any[] }>(
    `${prenBase()}?$expand=fields($select=Stato,Data,GoodId,Taglia,Pezzi,Righe)&$top=2000`,
    PREFER_NON_INDEXED
  )
  const candidate = res.value.filter((item) => {
    const f = item.fields ?? {}
    const stato = String(f.Stato ?? '').trim().toLowerCase()
    if (!STATI_NON_PERFEZIONATI.has(stato)) return false
    const t = new Date(String(f.Data ?? '')).getTime()
    // Senza data valida non si sa quanto è vecchia: la si lascia stare.
    return !isNaN(t) && t < limite.getTime()
  })

  let eliminate = 0
  let errori = 0
  for (const item of candidate.slice(0, maxPerGiro)) {
    const f = item.fields ?? {}
    try {
      const stato = String(f.Stato ?? '').trim().toLowerCase()
      if (normalizeStatus(stato) === 'pending' && f.GoodId) {
        const bene = await getBeneByLogicalId(String(f.GoodId))
        if (bene)
          await rilasciaPezzi(bene.spItemId, {
            pezzi: Math.max(1, Math.floor(Number(f.Pezzi ?? 1)) || 1),
            taglia: String(f.Taglia ?? ''),
            righe: leggiRighe(f.Righe),
          }).catch(() => {})
      }
      await graphDelete(`${prenBase()}/${item.id}`)
      eliminate++
    } catch {
      errori++
    }
  }
  return {
    mesi,
    trovate: candidate.length,
    eliminate,
    restanti: Math.max(0, candidate.length - eliminate - errori),
    errori,
  }
}

/** Trova un bene dal suo id logico (usato per aggiornare Venduti da una prenotazione). */
export async function getBeneByLogicalId(logicalId: string): Promise<Bene | null> {
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
