/**
 * Invio della ricevuta via Microsoft Graph (sendMail) con PDF allegato.
 * Il permesso applicativo Mail.Send consente l'invio anche a destinatari
 * esterni alla cooperativa. Il messaggio parte "come" MAIL_SENDER_EMAIL.
 */
import { graphPost } from '@/lib/graph'
import { COOP, METODO_LABEL } from '@/lib/config'
import { importoInLettere } from '@/lib/importo-in-lettere'
import type { Prenotazione } from '@/types'

function corpoHtml(p: Prenotazione, numeroRicevuta: string, dataStr: string): string {
  const nomeCompleto = `${p.nome} ${p.cognome}`.trim()
  const importoLett = importoInLettere(Number(p.importo))
  const metodo = METODO_LABEL[p.metodo] || p.metodo || '—'
  const eur = Number(p.importo).toFixed(2)

  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f0f6fb;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f6fb;padding:30px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(44,123,184,0.12);">
<tr><td style="background:linear-gradient(135deg,#1a5a8a,#2C7BB8);padding:32px 40px;text-align:center;">
  <p style="color:rgba(255,255,255,0.85);font-size:12px;margin:0 0 6px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">${COOP.nome}</p>
  <h1 style="color:#fff;font-size:22px;margin:0 0 6px;font-weight:700;">RICEVUTA PER EROGAZIONE LIBERALE</h1>
  <p style="color:rgba(255,255,255,0.75);font-size:13px;margin:0;font-family:monospace;">${numeroRicevuta}</p>
</td></tr>
<tr><td style="padding:36px 40px;">
  <p style="color:#7aaabf;font-size:13px;margin:0 0 20px;text-align:right;">Data: <strong style="color:#1a3a52;">${dataStr}</strong></p>
  <p style="color:#333;font-size:15px;line-height:1.8;margin:0 0 20px;">La <strong>${COOP.nome}</strong> dichiara di aver ricevuto quale erogazione liberale:</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
  <tr><td style="background:#f0f6fb;border:2px solid #2C7BB8;border-radius:10px;padding:22px;text-align:center;">
    <p style="margin:0;color:#7aaabf;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">Importo donazione</p>
    <p style="margin:8px 0;color:#2C7BB8;font-size:36px;font-weight:700;">&euro; ${eur}</p>
    <p style="margin:0;color:#7aaabf;font-size:12px;font-style:italic;">(${importoLett})</p>
  </td></tr></table>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fbfe;border-radius:10px;padding:18px;margin:0 0 24px;border:1px solid #d6e9f7;">
  <tr>
    <td width="50%" style="padding:6px 12px;vertical-align:top;">
      <p style="margin:0;color:#8ab0c8;font-size:11px;text-transform:uppercase;font-weight:700;">Nominativo</p>
      <p style="margin:3px 0 0;color:#1a3a52;font-size:14px;font-weight:700;">${nomeCompleto}</p>
    </td>
    <td width="50%" style="padding:6px 12px;vertical-align:top;">
      <p style="margin:0;color:#8ab0c8;font-size:11px;text-transform:uppercase;font-weight:700;">Codice Fiscale</p>
      <p style="margin:3px 0 0;color:#1a3a52;font-size:14px;font-weight:700;">${p.codiceFiscale}</p>
    </td>
  </tr>
  <tr><td colspan="2" style="padding:6px 12px;"><p style="margin:0;color:#8ab0c8;font-size:11px;text-transform:uppercase;font-weight:700;">Indirizzo</p><p style="margin:3px 0 0;color:#1a3a52;font-size:14px;">${p.indirizzo}</p></td></tr>
  <tr>
    <td width="50%" style="padding:6px 12px;"><p style="margin:0;color:#8ab0c8;font-size:11px;text-transform:uppercase;font-weight:700;">Bene prenotato</p><p style="margin:3px 0 0;color:#1a3a52;font-size:14px;">${p.goodName}</p></td>
    <td width="50%" style="padding:6px 12px;"><p style="margin:0;color:#8ab0c8;font-size:11px;text-transform:uppercase;font-weight:700;">Metodo pagamento</p><p style="margin:3px 0 0;color:#1a3a52;font-size:14px;">${metodo}</p></td>
  </tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fbfe;border-left:4px solid #2C7BB8;border-radius:0 8px 8px 0;margin:0 0 20px;">
  <tr><td style="padding:16px 20px;">
    <p style="margin:0 0 7px;color:#444;font-size:11px;line-height:1.8;">La ${COOP.nome} è ente non commerciale iscritta nel RUNTS di cui all'art. 45 del D.Lgs. 117/2017 in data 21/03/2022.</p>
    <p style="margin:0 0 7px;color:#444;font-size:11px;line-height:1.8;">Per le persone fisiche, l'erogazione liberale è detraibile al 30% fino a &euro; 30.000 (art. 83 co. 1 D.Lgs. 117/2017) o deducibile nel limite del 10% del reddito complessivo (art. 83 co. 2).</p>
    <p style="margin:0 0 7px;color:#444;font-size:11px;line-height:1.8;">Si rammenta che è condizione di deducibilità l'erogazione tramite banca, posta o sistema tracciabile.</p>
    <p style="margin:0;color:#444;font-size:11px;font-weight:700;">La presente ricevuta è esente da imposta di bollo ex art. 82 co. 5 del D.Lgs. n. 117/2017.</p>
  </td></tr></table>
  <div style="background:#f0fff4;border:1.5px solid #a8e6c0;border-radius:10px;padding:14px 18px;">
    <p style="margin:0;color:#276749;font-size:13px;font-weight:700;">In allegato trovi la ricevuta in formato PDF da conservare per la detrazione fiscale.</p>
  </div>
</td></tr>
<tr><td style="background:linear-gradient(135deg,#1a5a8a,#2C7BB8);padding:20px 40px;text-align:center;">
  <p style="color:rgba(255,255,255,0.85);font-size:12px;margin:0;font-weight:600;">${COOP.nome} · &quot;${COOP.motto}&quot;</p>
  <p style="color:rgba(255,255,255,0.6);font-size:11px;margin:4px 0 0;">${COOP.sito}</p>
</td></tr>
</table></td></tr></table></body></html>`
}

export async function inviaRicevutaEmail(
  p: Prenotazione,
  numeroRicevuta: string,
  dataStr: string,
  pdf: Buffer
): Promise<void> {
  const sender = process.env.MAIL_SENDER_EMAIL
  if (!sender) throw new Error('MAIL_SENDER_EMAIL non configurato')

  const bcc = process.env.MAIL_BCC
  const message: any = {
    subject: `Ricevuta donazione ${numeroRicevuta} · ${COOP.progetto}`,
    body: { contentType: 'HTML', content: corpoHtml(p, numeroRicevuta, dataStr) },
    toRecipients: [{ emailAddress: { address: p.email } }],
    attachments: [
      {
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: `Ricevuta_${numeroRicevuta}.pdf`,
        contentType: 'application/pdf',
        contentBytes: pdf.toString('base64'),
      },
    ],
  }
  if (bcc) message.bccRecipients = [{ emailAddress: { address: bcc } }]

  await graphPost(`/users/${encodeURIComponent(sender)}/sendMail`, {
    message,
    saveToSentItems: true,
  })
}
