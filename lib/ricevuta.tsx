/**
 * Generazione della ricevuta PDF per erogazioni liberali con @react-pdf/renderer.
 * Port fedele del layout prodotto da generaPdfESalva() nel backend Apps Script.
 *
 * Usato SOLO server-side (runtime nodejs).
 */
import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'
import { COOP, METODO_LABEL, BRAND } from '@/lib/config'
import { FIRMA_RAPPRESENTANTE_PNG } from '@/lib/firma'
import { importoInLettere } from '@/lib/importo-in-lettere'
import type { Prenotazione } from '@/types'

const s = StyleSheet.create({
  page: { paddingVertical: 40, paddingHorizontal: 50, fontFamily: 'Helvetica', color: '#333333' },
  coop: { textAlign: 'center', fontSize: 11, color: BRAND.blu, fontFamily: 'Helvetica-Bold' },
  sub: { textAlign: 'center', fontSize: 10, color: BRAND.gray, marginBottom: 8 },
  rule: { borderBottomWidth: 1.5, borderBottomColor: BRAND.blu, marginVertical: 8 },
  ruleLight: { borderBottomWidth: 0.8, borderBottomColor: '#ccddee', marginVertical: 10 },
  titolo: { textAlign: 'center', fontSize: 18, color: BRAND.bluDarker, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  numero: { textAlign: 'center', fontSize: 12, color: BRAND.blu, fontFamily: 'Helvetica-Bold', marginBottom: 8 },
  data: { textAlign: 'right', fontSize: 10, color: BRAND.gray, marginBottom: 8 },
  corpo: { fontSize: 11, color: '#333333', lineHeight: 1.5, marginBottom: 10 },
  importo: { textAlign: 'center', fontSize: 28, color: BRAND.blu, fontFamily: 'Helvetica-Bold' },
  importoLett: { textAlign: 'center', fontSize: 10, color: BRAND.gray, fontFamily: 'Helvetica-Oblique', marginBottom: 12 },
  daLabel: { fontSize: 11, color: BRAND.bluDarker, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  riga: { flexDirection: 'row', marginBottom: 3, fontSize: 11 },
  rigaEt: { color: BRAND.lightGray, width: 130 },
  rigaVal: { color: '#333333', fontFamily: 'Helvetica-Bold', flex: 1 },
  legale: { fontSize: 9, color: BRAND.gray, lineHeight: 1.4, marginBottom: 5 },
  esente: { fontSize: 9, color: BRAND.gray, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  firmaLabel: { fontSize: 10, color: BRAND.bluDarker, fontFamily: 'Helvetica-Bold', marginTop: 18, marginBottom: 6 },
  // La firma poggia sulla linea: il marginBottom negativo compensa il marginTop della linea.
  firmaImg: { width: 150, height: 82, marginLeft: 10, marginTop: 0, marginBottom: -24 },
  firmaLinea: { fontSize: 11, color: BRAND.lightGray, marginTop: 10 },
  privacy: { textAlign: 'center', fontSize: 8, color: BRAND.lightGray, fontFamily: 'Helvetica-Oblique', marginTop: 10 },
})

const LEGALI = [
  "La Cooperativa Sociale Mirafiori è ente non commerciale iscritta nel RUNTS (Registro Unico Nazionale del Terzo Settore) di cui all'art. 45 del D.Lgs. 117/2017 e s.m.i. in data 21/03/2022.",
  "Per le persone fisiche, l'erogazione liberale è detraibile al 30% fino a € 30.000 (art. 83 co. 1 del D.Lgs. n. 117/2017) o, in alternativa, è deducibile nel limite del 10% reddito complessivo dichiarato (art. 83 co. 2 del D.Lgs. n. 117/2017).",
  "Per gli enti e le aziende, l'erogazione liberale è deducibile nel limite del 10% reddito complessivo dichiarato (art. 83 co. 2 del D.Lgs. n. 117/2017).",
  "Si rammenta che è condizione di deducibilità o detraibilità delle donazioni l'erogazione delle stesse tramite banca, posta o altro sistema tracciabile previsto dalle norme.",
]

function Riga({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <View style={s.riga}>
      <Text style={s.rigaEt}>{etichetta}</Text>
      <Text style={s.rigaVal}>{valore || '—'}</Text>
    </View>
  )
}

function RicevutaDoc({
  p,
  numeroRicevuta,
  dataStr,
}: {
  p: Prenotazione
  numeroRicevuta: string
  dataStr: string
}) {
  const nomeCompleto = `${p.nome} ${p.cognome}`.trim()
  const importoLett = importoInLettere(Number(p.importo))
  const metodo = METODO_LABEL[p.metodo] || p.metodo || '—'

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.coop}>{COOP.nome.toUpperCase()}</Text>
        <Text style={s.sub}>{COOP.progetto}</Text>
        <View style={s.rule} />

        <Text style={s.titolo}>RICEVUTA PER EROGAZIONI LIBERALI</Text>
        <Text style={s.numero}>{numeroRicevuta}</Text>
        <Text style={s.data}>Data: {dataStr}</Text>

        <Text style={s.corpo}>
          La Cooperativa Sociale Mirafiori, nella persona del suo rappresentante legale, dichiara di
          aver ricevuto quale erogazione liberale in data odierna:
        </Text>

        <Text style={s.importo}>€ {Number(p.importo).toFixed(2)}</Text>
        <Text style={s.importoLett}>({importoLett})</Text>

        <Text style={s.daLabel}>Da:</Text>
        <Riga etichetta="Nominativo:" valore={nomeCompleto} />
        <Riga etichetta="Indirizzo:" valore={p.indirizzo} />
        <Riga etichetta="C.F. o P. IVA:" valore={p.codiceFiscale} />
        <Riga etichetta="Metodo di pagamento:" valore={metodo} />

        <View style={s.ruleLight} />

        {LEGALI.map((t, i) => (
          <Text key={i} style={s.legale}>
            {t}
          </Text>
        ))}
        <Text style={s.esente}>
          La presente ricevuta è esente da imposta di bollo ex art. 82 co. 5 del D.Lgs. n. 117/2017.
        </Text>

        <Text style={s.firmaLabel}>FIRMA LEGALE RAPPRESENTANTE</Text>
        <Image src={FIRMA_RAPPRESENTANTE_PNG} style={s.firmaImg} />
        <Text style={s.firmaLinea}>____________________________________</Text>

        <View style={s.rule} />
        <Text style={s.privacy}>
          I dati personali collegati alla donazione verranno trattati nel rispetto del GDPR 679/2016
          e D.lgs 196/03. Per l'informativa completa si rimanda alla privacy policy sui canali
          istituzionali dell'ente.
        </Text>
      </Page>
    </Document>
  )
}

/** Formatta una data in "dd/MM/yyyy HH:mm:ss" fuso Europe/Rome. */
export function formatDataRicevuta(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${g('day')}/${g('month')}/${g('year')} ${g('hour')}:${g('minute')}:${g('second')}`
}

/** Renderizza la ricevuta in un Buffer PDF. */
export async function renderRicevutaPdf(
  p: Prenotazione,
  numeroRicevuta: string,
  dataStr: string
): Promise<Buffer> {
  return renderToBuffer(<RicevutaDoc p={p} numeroRicevuta={numeroRicevuta} dataStr={dataStr} />)
}
