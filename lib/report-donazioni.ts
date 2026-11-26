/**
 * Report quindicinale delle donazioni della pagina /dona (serie MIR) per
 * progetto, inviato via email a chi distribuisce i fondi ai progetti.
 *
 * - Periodo: le due settimane solari precedenti, lunedì 00:00 → lunedì 00:00
 *   (ora di Roma). Il giorno di invio è escluso: finisce nel report successivo.
 * - Si contano le donazioni **pagate** (Stato = paid) con ricevuta MIR,
 *   raggruppate per progetto (nome del bene, `GoodName`). I **bonifici non
 *   ancora confermati** (Stato = pending, metodo bonifico) del periodo sono
 *   inclusi ma tenuti a parte, con la dicitura "da controllare": non entrano
 *   nei totali confermati.
 * - La data usata è `Data` (quando il donatore ha compilato il modulo).
 *   Un bonifico confermato dopo l'invio non ricompare nel report successivo:
 *   è già stato segnalato come "da controllare" in quello del suo periodo.
 *
 * Destinatario: `REPORT_DONAZIONI_TO` (più indirizzi separati da virgola),
 * default claudia.carena@cooperativamirafiori.com. Mittente: MAIL_SENDER_EMAIL.
 */
import { graphPost } from '@/lib/graph'
import { getPrenotazioni } from '@/lib/lists'
import { serieDaNumero } from '@/lib/serie'
import { COOP, METODO_LABEL } from '@/lib/config'

const TZ = 'Europe/Rome'
const DESTINATARIO_DEFAULT = 'claudia.carena@cooperativamirafiori.com'

/**
 * Lunedì di riferimento della cadenza quindicinale: il cron gira ogni lunedì,
 * ma invia solo nei lunedì a distanza pari di settimane da questo.
 */
const LUNEDI_ANCORA = '2026-11-30'

/** Data di calendario (YYYY-MM-DD) a Roma di un istante. */
export function giornoRoma(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Somma giorni a una data YYYY-MM-DD (aritmetica di calendario, in UTC). */
export function sommaGiorni(giorno: string, n: number): string {
  const d = new Date(`${giorno}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function giorniTra(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86_400_000
  )
}

/** true se `giorno` è un lunedì di invio (settimane pari dall'ancora). */
export function eGiornoDiInvio(giorno: string): boolean {
  const diff = giorniTra(LUNEDI_ANCORA, giorno)
  return diff >= 0 && diff % 14 === 0
}

export type PeriodoReport = { da: string; a: string } // [da, a) — `a` escluso

/** Le due settimane che terminano (esclusa) a `oggi`. */
export function periodoQuindicinale(oggi: string): PeriodoReport {
  return { da: sommaGiorni(oggi, -14), a: oggi }
}

export type RigaProgetto = {
  progetto: string
  numero: number
  totale: number
  /** Bonifici del periodo non ancora confermati (esclusi da numero/totale). */
  numeroDaControllare: number
  totaleDaControllare: number
}
export type RigaDonazione = {
  giorno: string
  numeroRicevuta: string
  progetto: string
  importo: number
  metodo: string
  /** true = bonifico non ancora confermato, da controllare */
  daControllare: boolean
}
export type Report = {
  periodo: PeriodoReport
  progetti: RigaProgetto[]
  donazioni: RigaDonazione[]
  totale: number
  totaleDaControllare: number
}

export async function calcolaReport(periodo: PeriodoReport): Promise<Report> {
  const tutte = await getPrenotazioni()
  const donazioni: RigaDonazione[] = []

  for (const p of tutte) {
    const bonificoInAttesa = p.stato === 'pending' && p.metodo === 'bonifico'
    if (p.stato !== 'paid' && !bonificoInAttesa) continue
    if (serieDaNumero(p.numeroRicevuta) !== 'MIR') continue
    const t = new Date(p.data)
    if (isNaN(t.getTime())) continue
    const giorno = giornoRoma(t)
    if (giorno < periodo.da || giorno >= periodo.a) continue
    donazioni.push({
      giorno,
      numeroRicevuta: p.numeroRicevuta,
      progetto: p.goodName || '(progetto non indicato)',
      importo: Number(p.importo) || 0,
      metodo: METODO_LABEL[p.metodo] || p.metodo || '—',
      daControllare: bonificoInAttesa,
    })
  }

  donazioni.sort((a, b) => a.giorno.localeCompare(b.giorno) || a.numeroRicevuta.localeCompare(b.numeroRicevuta))

  const perProgetto = new Map<string, RigaProgetto>()
  for (const d of donazioni) {
    const r = perProgetto.get(d.progetto) ?? {
      progetto: d.progetto,
      numero: 0,
      totale: 0,
      numeroDaControllare: 0,
      totaleDaControllare: 0,
    }
    if (d.daControllare) {
      r.numeroDaControllare += 1
      r.totaleDaControllare += d.importo
    } else {
      r.numero += 1
      r.totale += d.importo
    }
    perProgetto.set(d.progetto, r)
  }
  const progetti = [...perProgetto.values()].sort((a, b) => b.totale - a.totale)
  const totale = donazioni.filter((d) => !d.daControllare).reduce((s, d) => s + d.importo, 0)
  const totaleDaControllare = donazioni
    .filter((d) => d.daControllare)
    .reduce((s, d) => s + d.importo, 0)

  return { periodo, progetti, donazioni, totale, totaleDaControllare }
}

const eur = (n: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n)

/** YYYY-MM-DD → "16/11/2026" */
const it = (g: string) => g.split('-').reverse().join('/')

function corpoHtml(r: Report): string {
  const ultimoGiorno = sommaGiorni(r.periodo.a, -1)
  const th = 'style="text-align:left;padding:8px 10px;border-bottom:2px solid #2C7BB8;color:#1a3a52;font-size:13px;"'
  const thR = 'style="text-align:right;padding:8px 10px;border-bottom:2px solid #2C7BB8;color:#1a3a52;font-size:13px;"'
  const td = 'style="padding:7px 10px;border-bottom:1px solid #e3edf5;font-size:13px;color:#333;"'
  const tdR = 'style="padding:7px 10px;border-bottom:1px solid #e3edf5;font-size:13px;color:#333;text-align:right;white-space:nowrap;"'

  const nConf = r.donazioni.filter((d) => !d.daControllare).length
  const nCtrl = r.donazioni.length - nConf
  const haCtrl = nCtrl > 0
  const tdCtrl = 'style="padding:7px 10px;border-bottom:1px solid #e3edf5;font-size:13px;color:#b45309;text-align:right;white-space:nowrap;"'
  const cellaCtrl = (n: number, tot: number) =>
    haCtrl ? `<td ${tdCtrl}>${n ? `${n} · ${eur(tot)}` : '—'}</td>` : ''

  const tabellaProgetti = r.progetti.length
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;">
<tr><th ${th}>Progetto</th><th ${thR}>Donazioni</th><th ${thR}>Totale confermato</th>${
        haCtrl ? `<th ${thR}>Bonifici da controllare</th>` : ''
      }</tr>
${r.progetti
  .map(
    (p) =>
      `<tr><td ${td}>${esc(p.progetto)}</td><td ${tdR}>${p.numero}</td><td ${tdR}><b>${eur(p.totale)}</b></td>${cellaCtrl(p.numeroDaControllare, p.totaleDaControllare)}</tr>`
  )
  .join('\n')}
<tr><td ${td}><b>Totale</b></td><td ${tdR}><b>${nConf}</b></td><td ${tdR}><b>${eur(r.totale)}</b></td>${cellaCtrl(nCtrl, r.totaleDaControllare)}</tr>
</table>
${
  haCtrl
    ? `<p style="color:#b45309;font-size:13px;line-height:1.5;margin:-12px 0 24px;">I bonifici da controllare non sono ancora stati confermati: verificare l'accredito in banca prima di girare i fondi. Non sono compresi nel totale confermato.</p>`
    : ''
}`
    : `<p style="color:#333;font-size:15px;margin:0 0 24px;">Nessuna donazione ricevuta nel periodo.</p>`

  const dettaglio = r.donazioni.length
    ? `<p style="color:#1a3a52;font-size:14px;font-weight:700;margin:0 0 8px;">Dettaglio</p>
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
<tr><th ${th}>Data</th><th ${th}>Ricevuta</th><th ${th}>Progetto</th><th ${th}>Metodo</th><th ${thR}>Importo</th><th ${th}>Stato</th></tr>
${r.donazioni
  .map(
    (d) =>
      `<tr><td ${td}>${it(d.giorno)}</td><td ${td}>${esc(d.numeroRicevuta)}</td><td ${td}>${esc(d.progetto)}</td><td ${td}>${esc(d.metodo)}</td><td ${tdR}>${eur(d.importo)}</td><td ${td}>${
        d.daControllare
          ? '<span style="color:#b45309;font-weight:700;">Da controllare</span>'
          : 'Confermata'
      }</td></tr>`
  )
  .join('\n')}
</table>`
    : ''

  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f0f6fb;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f6fb;padding:30px 0;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#1a5a8a,#2C7BB8);padding:26px 36px;">
  <p style="color:rgba(255,255,255,0.85);font-size:12px;margin:0 0 6px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">${COOP.nome}</p>
  <h1 style="color:#fff;font-size:20px;margin:0;font-weight:700;">Donazioni per progetto</h1>
  <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:6px 0 0;">dal ${it(r.periodo.da)} al ${it(ultimoGiorno)}</p>
</td></tr>
<tr><td style="padding:28px 36px;">
  <p style="color:#333;font-size:14px;line-height:1.6;margin:0 0 18px;">Ecco le donazioni ricevute dalla pagina Donazioni nelle ultime due settimane, divise per progetto.</p>
  ${tabellaProgetti}
  ${dettaglio}
  <p style="color:#888;font-size:12px;line-height:1.5;margin:24px 0 0;">Email automatica inviata ogni due settimane dall'app Amazing. Sono incluse le donazioni pagate (ricevute serie MIR) e, a parte, i bonifici del periodo non ancora confermati; la data è quella del modulo di donazione.</p>
</td></tr>
</table></td></tr></table></body></html>`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function destinatariReport(): string[] {
  return (process.env.REPORT_DONAZIONI_TO || DESTINATARIO_DEFAULT)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function inviaReport(r: Report): Promise<string[]> {
  const sender = process.env.MAIL_SENDER_EMAIL
  if (!sender) throw new Error('MAIL_SENDER_EMAIL non configurato')
  const to = destinatariReport()
  const ultimoGiorno = sommaGiorni(r.periodo.a, -1)

  await graphPost(`/users/${encodeURIComponent(sender)}/sendMail`, {
    message: {
      subject: `Donazioni per progetto · ${it(r.periodo.da)} – ${it(ultimoGiorno)} · totale ${eur(r.totale)}${
        r.totaleDaControllare ? ` + ${eur(r.totaleDaControllare)} da controllare` : ''
      }`,
      body: { contentType: 'HTML', content: corpoHtml(r) },
      toRecipients: to.map((address) => ({ emailAddress: { address } })),
    },
    saveToSentItems: true,
  })
  return to
}
