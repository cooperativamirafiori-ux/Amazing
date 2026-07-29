/**
 * Archiviazione delle ricevute PDF in una libreria documenti SharePoint.
 *
 * Percorso di destinazione, nel sito **Segreteria** (diverso da quello che
 * ospita le liste dell'app, ma nello stesso tenant):
 *
 *   /sites/Segreteria / <libreria predefinita> / General / DONAZIONI /
 *     RICEVUTE PER DONAZIONI / <anno> / Inviate / AMZ
 *
 * La libreria è quella predefinita del sito: nell'URL è "Documenti condivisi",
 * ma Graph la espone come "Documenti". Per questo non la cerchiamo per nome.
 *
 * L'anno è dinamico: le ricevute emesse nel 2027 finiscono nella cartella 2027,
 * creata automaticamente se non esiste (come ogni altra cartella mancante del
 * percorso).
 *
 * I default puntano già alla cartella giusta: **non serve configurare nulla**.
 * Le env servono solo per cambiare destinazione o per ottimizzare:
 *   SP_RICEVUTE_DRIVE_ID   id del drive (libreria): se presente si salta la
 *                          risoluzione del sito, risparmiando una chiamata
 *                          Graph al primo utilizzo dopo ogni cold start
 *   SP_RICEVUTE_SITE       path o id del sito
 *   SP_RICEVUTE_LIBRERIA   nome Graph di un'ALTRA libreria del sito (di default
 *                          si usa la predefinita, senza cercarla per nome)
 *   SP_RICEVUTE_CARTELLA   percorso cartella, {anno} viene sostituito
 *   SP_RICEVUTE_OFF=1      disattiva l'archiviazione (ricevuta solo via email)
 *
 * Permesso Graph necessario: Sites.ReadWrite.All (Application) — lo stesso già
 * usato per le liste. Essendo un permesso applicativo vale su **tutti** i siti
 * del tenant, quindi non c'è nessun accesso da concedere sito per sito.
 *
 * Usato SOLO server-side (runtime nodejs).
 */
import { graphGet, graphPost, graphPutBinary } from '@/lib/graph'

const SITO_DEFAULT = 'coopmirafiorionlus.sharepoint.com:/sites/Segreteria'
const CARTELLA_DEFAULT = 'General/DONAZIONI/RICEVUTE PER DONAZIONI/{anno}/Inviate/AMZ'

/** Interruttore per disattivare l'archiviazione (es. in locale). */
export function archivioAbilitato(): boolean {
  const off = String(process.env.SP_RICEVUTE_OFF ?? '').toLowerCase()
  return !(off === '1' || off === 'true')
}

/** Percorso cartella per un dato anno, con {anno} risolto e slash normalizzati. */
export function cartellaRicevute(anno: number): string {
  const tpl = process.env.SP_RICEVUTE_CARTELLA || CARTELLA_DEFAULT
  return tpl.replace(/\{anno\}/g, String(anno)).replace(/^\/+|\/+$/g, '')
}

/** Ogni segmento va percent-encoded separatamente: i nomi contengono spazi. */
function encodePath(path: string): string {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/')
}

/** Caratteri non ammessi nei nomi file SharePoint. */
function nomeFileSicuro(nome: string): string {
  return nome
    .replace(/["*:<>?/\\|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

let _driveIdCache: string | null = null

/** Id del drive di destinazione, risolto una volta e tenuto in cache. */
async function getDriveId(): Promise<string> {
  if (_driveIdCache) return _driveIdCache

  const diretto = process.env.SP_RICEVUTE_DRIVE_ID
  if (diretto) {
    _driveIdCache = diretto
    return diretto
  }

  const site = process.env.SP_RICEVUTE_SITE || SITO_DEFAULT

  // Senza SP_RICEVUTE_LIBRERIA si usa la libreria PREDEFINITA del sito, che è
  // quella che serve: la "Documenti" / "Documenti condivisi" / "Shared
  // Documents" del sito Segreteria. Evita di dipendere dal nome visualizzato,
  // che varia con la lingua del tenant e non coincide col segmento URL.
  const libreria = process.env.SP_RICEVUTE_LIBRERIA
  if (!libreria) {
    const drive = await graphGet<{ id: string }>(`/sites/${site}/drive`)
    _driveIdCache = drive.id
    return _driveIdCache
  }

  const res = await graphGet<{ value: { id: string; name: string }[] }>(`/sites/${site}/drives`)
  const trovato = res.value.find((d) => d.name.toLowerCase() === libreria.toLowerCase())
  if (!trovato) {
    throw new Error(
      `Libreria "${libreria}" non trovata nel sito. Disponibili: ${res.value
        .map((d) => d.name)
        .join(', ')}`
    )
  }
  _driveIdCache = trovato.id
  return _driveIdCache
}

/**
 * Crea le cartelle mancanti del percorso, un livello alla volta.
 * Idempotente: il 409 (già esistente) viene ignorato.
 */
async function assicuraCartella(driveId: string, path: string): Promise<void> {
  const segmenti = path.split('/').filter(Boolean)
  let corrente = ''

  for (const segmento of segmenti) {
    const parent = corrente
    corrente = corrente ? `${corrente}/${segmento}` : segmento

    try {
      await graphGet(`/drives/${driveId}/root:/${encodePath(corrente)}`)
      continue // esiste già
    } catch {
      // non esiste: la creiamo sotto il parent
    }

    const target = parent
      ? `/drives/${driveId}/root:/${encodePath(parent)}:/children`
      : `/drives/${driveId}/root/children`
    try {
      await graphPost(target, {
        name: segmento,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      })
    } catch (err: any) {
      // 409 = creata in parallelo da un'altra richiesta: va bene così.
      if (!String(err?.message ?? '').includes('(409)')) throw err
    }
  }
}

export interface RicevutaArchiviata {
  /** Link al file su SharePoint (da salvare in PdfUrl). */
  webUrl: string
  /** Nome del file caricato. */
  nomeFile: string
  /** Percorso cartella usato, utile nei log. */
  cartella: string
}

/**
 * Salva il PDF della ricevuta nella cartella dell'anno indicato.
 * Se il file esiste già viene sovrascritto (così la riarchiviazione manuale
 * dall'area admin non crea duplicati tipo "Ricevuta_xxx 1.pdf").
 */
export async function archiviaRicevuta(opts: {
  pdf: Buffer
  numeroRicevuta: string
  nominativo?: string
  anno?: number
}): Promise<RicevutaArchiviata> {
  const driveId = await getDriveId()
  const anno = opts.anno ?? new Date().getFullYear()
  const cartella = cartellaRicevute(anno)

  await assicuraCartella(driveId, cartella)

  const suffisso = opts.nominativo ? `_${opts.nominativo.replace(/\s+/g, '_')}` : ''
  const nomeFile = nomeFileSicuro(`Ricevuta_${opts.numeroRicevuta}${suffisso}.pdf`)

  const item = await graphPutBinary<{ webUrl?: string }>(
    `/drives/${driveId}/root:/${encodePath(cartella)}/${encodeURIComponent(nomeFile)}:/content`,
    opts.pdf,
    'application/pdf'
  )

  return { webUrl: item.webUrl ?? '', nomeFile, cartella }
}
