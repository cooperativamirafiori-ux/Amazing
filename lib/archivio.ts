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
 *                          risoluzione del sito, risparmiando due chiamate
 *                          Graph al primo utilizzo dopo ogni cold start
 *                          (lo stampa scripts/setup-archivio-ricevute.mjs)
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

/**
 * Legge una env ignorando i **segnaposto** non sostituiti.
 *
 * Succede davvero: copiando un comando d'esempio si finisce per impostare
 * letteralmente `SP_RICEVUTE_DRIVE_ID=<drive-id>`, e quel valore arrivava fino
 * a Graph, che rispondeva con un 400 criptico ("A potentially dangerous
 * Request.Path value was detected from the client (<)"). Meglio trattarlo come
 * non impostata e ricadere sui default, segnalandolo nei log.
 */
function envValida(nome: string): string | undefined {
  const raw = process.env[nome]?.trim()
  if (!raw) return undefined
  if (/[<>]/.test(raw)) {
    console.warn(
      `[archivio] ${nome} contiene un segnaposto non sostituito ("${raw}"): la ignoro e uso i default.`
    )
    return undefined
  }
  return raw
}

/** Interruttore per disattivare l'archiviazione (es. in locale). */
export function archivioAbilitato(): boolean {
  const off = String(process.env.SP_RICEVUTE_OFF ?? '').toLowerCase()
  return !(off === '1' || off === 'true')
}

/**
 * Divide il percorso in due parti attorno a `{anno}`:
 *
 *   base   = General/DONAZIONI/RICEVUTE PER DONAZIONI   → deve già esistere
 *   creabile = 2027/Inviate/AMZ                          → l'app può crearla
 *
 * L'app crea cartelle **solo dall'anno in giù**. Così il rinnovo di gennaio
 * resta automatico, ma un percorso configurato male non può generare un albero
 * di cartelle inventate nella libreria della Segreteria: se la base non c'è,
 * l'archiviazione si ferma e lo segnala.
 *
 * Senza `{anno}` nel modello non c'è modo di distinguere le due parti: in quel
 * caso si considera creabile solo l'ultimo segmento.
 */
export function dividiCartella(anno: number): { base: string; creabile: string } {
  const tpl = envValida('SP_RICEVUTE_CARTELLA') || CARTELLA_DEFAULT
  const pulisci = (s: string) => s.replace(/^\/+|\/+$/g, '')

  const i = tpl.indexOf('{anno}')
  if (i >= 0) {
    return {
      base: pulisci(tpl.slice(0, i)),
      creabile: pulisci(tpl.slice(i)).replace(/\{anno\}/g, String(anno)),
    }
  }

  const segmenti = pulisci(tpl).split('/').filter(Boolean)
  return {
    base: segmenti.slice(0, -1).join('/'),
    creabile: segmenti.slice(-1).join('/'),
  }
}

/** Percorso cartella completo per un dato anno. */
export function cartellaRicevute(anno: number): string {
  const { base, creabile } = dividiCartella(anno)
  return [base, creabile].filter(Boolean).join('/')
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

  const diretto = envValida('SP_RICEVUTE_DRIVE_ID')
  if (diretto) {
    _driveIdCache = diretto
    return diretto
  }

  const site = envValida('SP_RICEVUTE_SITE') || SITO_DEFAULT

  // Prima si risolve l'ID del sito, poi si usa quello per il drive.
  // NON si può concatenare `/sites/{host}:/sites/Segreteria` + `/drive`: in un
  // path Graph con i due punti il percorso va chiuso da un secondo `:` prima di
  // qualsiasi altro segmento, altrimenti Graph risponde 404 itemNotFound.
  // Passando dall'ID il problema non esiste e la stessa logica funziona sia che
  // SP_RICEVUTE_SITE contenga un path sia che contenga un ID già pronto.
  const sito = await graphGet<{ id: string }>(`/sites/${site}`)

  // Senza SP_RICEVUTE_LIBRERIA si usa la libreria PREDEFINITA del sito, che è
  // quella che serve: la "Documenti" / "Documenti condivisi" / "Shared
  // Documents" del sito Segreteria. Evita di dipendere dal nome visualizzato,
  // che varia con la lingua del tenant e non coincide col segmento URL.
  const libreria = envValida('SP_RICEVUTE_LIBRERIA')
  if (!libreria) {
    const drive = await graphGet<{ id: string }>(`/sites/${sito.id}/drive`)
    _driveIdCache = drive.id
    return _driveIdCache
  }

  const res = await graphGet<{ value: { id: string; name: string }[] }>(
    `/sites/${sito.id}/drives`
  )
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

function eNonTrovato(err: unknown): boolean {
  return String((err as any)?.message ?? '').includes('(404)')
}

/** Vero se la cartella esiste. Rilancia su errori diversi dal 404. */
async function cartellaEsiste(driveId: string, path: string): Promise<boolean> {
  try {
    await graphGet(`/drives/${driveId}/root:/${encodePath(path)}`)
    return true
  } catch (err) {
    // Solo il 404 significa "non c'è". Su 403, 400 o rete giù è più sicuro
    // fermarsi: con un drive id sbagliato si finiva a creare cartelle su una
    // destinazione arbitraria.
    if (!eNonTrovato(err)) throw err
    return false
  }
}

/**
 * Crea le cartelle mancanti **solo sotto `base`**, un livello alla volta.
 *
 * `base` non viene mai creata: se manca, si interrompe con un messaggio chiaro.
 * È la garanzia che un percorso configurato male non possa generare un albero di
 * cartelle inventate nella libreria della Segreteria — al massimo l'archiviazione
 * si ferma, e la ricevuta è comunque già partita via email.
 *
 * Idempotente: il 409 (creata in parallelo) viene ignorato.
 */
async function assicuraCartella(driveId: string, base: string, creabile: string): Promise<void> {
  if (base && !(await cartellaEsiste(driveId, base))) {
    throw new Error(
      `La cartella di destinazione "${base}" non esiste nella libreria e l'app non è autorizzata a crearla. ` +
        `Creala da SharePoint (o verifica SP_RICEVUTE_CARTELLA).`
    )
  }

  let corrente = base
  for (const segmento of creabile.split('/').filter(Boolean)) {
    const parent = corrente
    corrente = corrente ? `${corrente}/${segmento}` : segmento

    if (await cartellaEsiste(driveId, corrente)) continue

    const target = parent
      ? `/drives/${driveId}/root:/${encodePath(parent)}:/children`
      : `/drives/${driveId}/root/children`
    try {
      await graphPost(target, {
        name: segmento,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      })
      console.log(`[archivio] creata cartella "${corrente}"`)
    } catch (err) {
      if (!String((err as any)?.message ?? '').includes('(409)')) throw err
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
  const { base, creabile } = dividiCartella(anno)
  const cartella = cartellaRicevute(anno)

  await assicuraCartella(driveId, base, creabile)

  const suffisso = opts.nominativo ? `_${opts.nominativo.replace(/\s+/g, '_')}` : ''
  const nomeFile = nomeFileSicuro(`Ricevuta_${opts.numeroRicevuta}${suffisso}.pdf`)

  const item = await graphPutBinary<{ webUrl?: string }>(
    `/drives/${driveId}/root:/${encodePath(cartella)}/${encodeURIComponent(nomeFile)}:/content`,
    opts.pdf,
    'application/pdf'
  )

  return { webUrl: item.webUrl ?? '', nomeFile, cartella }
}
