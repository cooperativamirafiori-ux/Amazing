import type { Metadata } from 'next'
import Link from 'next/link'
import { COOP } from '@/lib/config'
import { INFORMATIVA } from '@/lib/informativa'

export const metadata: Metadata = {
  title: `Informativa privacy donatori · ${COOP.nome}`,
  description: `Informativa privacy per i donatori della ${COOP.nome} (art. 13 GDPR).`,
}

/**
 * Informativa privacy donatori (INF08 v1.0), pubblicata come pagina.
 *
 * Il TESTO deve restare identico al PDF approvato
 * (public/INF08_Informativa_DONATORI_VER_1.0.pdf): si può cambiare la grafica,
 * non il contenuto. Ogni nuova versione dell'informativa va recepita qui, nel
 * PDF e in `INFORMATIVA.versione` (lib/informativa.ts), che finisce nella
 * colonna VersioneInformativa di ogni prenotazione.
 *
 * Vale sia per la pagina /dona sia per il checkout Amazing: entrambi linkano qui.
 */

type Blocco = { p: string } | { ul: string[] }
type Sezione = { titolo: string; blocchi: Blocco[] }

const INDICE = [
  '0. INTRODUZIONE',
  '1. TITOLARE DEL TRATTAMENTO',
  '2. RACCOLTA DATI PERSONALI E BASI GIURIDICHE',
  '3. FINALITA’ DEL TRATTAMENTO',
  '4. SICUREZZA DEI DATI PERSONALI',
  '5. PERIODO DI CONSERVAZIONE DEI DATI',
  '6. TRASFERIMENTO INTERNAZIONALE DI DATI',
  '7. CONDIVISIONE DEI DATI PERSONALI',
  '8. OBBLIGO DI CONFERIMENTO DEI DATI ED EVENTUALI CONSEGUENZE IN CASO DI RIFIUTO',
  '9. TIPOLOGIA DEI DATI PERSONALI RACCOLTI',
  '10. RESPONSABILE DELLA PROTEZIONE DEI DATI',
  '11. DIRITTI DI PROTEZIONE DEI DATI',
  '12. MODIFICHE ALL\'INFORMATIVA SULLA PRIVACY',
  '13. CANCELLAZIONI OPPOSIZIONE E RETTIFICHE',
  '14. INFORMAZIONI E REVISIONI',
]

const SEZIONI: Sezione[] = [
  {
    titolo: '0. INTRODUZIONE',
    blocchi: [
      {
        p: 'La tutela dei dati personali è parte del rapporto di fiducia tra la Cooperativa Sociale Mirafiori e chi sceglie di sostenerne le attività con una donazione liberale.',
      },
      {
        p: 'La presente informativa riguarda i dati che il Donatore inserisce nel modulo della pagina donazioni (persona fisica oppure ente o azienda) e quelli che la Cooperativa riceve in relazione al pagamento della donazione.',
      },
      {
        p: 'Per “trattamento” si intende qualsiasi operazione compiuta con o senza l’ausilio di processi automatizzati e applicata a dati personali, come la raccolta, la registrazione, l’organizzazione, la conservazione, la consultazione, l’uso, la comunicazione, la cancellazione o la distruzione.',
      },
    ],
  },
  {
    titolo: '1. TITOLARE DEL TRATTAMENTO',
    blocchi: [
      {
        p: 'Titolare del trattamento è la Cooperativa Sociale Mirafiori S.C.S., con sede legale in S.da del Drosso 33/7, 10135 Torino, contattabile ai seguenti recapiti: e-mail ocgdpr@cooperativamirafiori.com – PEC mirafioriscs@pec.confcooperative.it – telefono 0113471263 / 01119176035.',
      },
      {
        p: 'Il Titolare decide in ordine alle finalità e alle modalità del trattamento dei dati personali, nonché alla loro sicurezza e agli strumenti utilizzati.',
      },
    ],
  },
  {
    titolo: '2. RACCOLTA DATI PERSONALI E BASI GIURIDICHE',
    blocchi: [
      {
        p: 'I dati sono forniti direttamente dal Donatore compilando il modulo della pagina donazioni. Le informazioni inserite sono registrate direttamente in liste SharePoint dell’ambiente Microsoft 365 della Cooperativa; la pagina web non le conserva in altri archivi.',
      },
      {
        p: 'I dati di pagamento (carta, conto PayPal, account Satispay) non sono raccolti né conservati dalla Cooperativa: sono trattati direttamente da PayPal e Satispay in qualità di autonomi titolari del trattamento, secondo le rispettive informative privacy. In caso di bonifico, la Cooperativa riceve dalla propria banca i dati dell’ordinante riportati nella disposizione (nome, IBAN, causale).',
      },
      { p: 'Le basi giuridiche del trattamento (art. 6 GDPR) sono:' },
      {
        ul: [
          'esecuzione del rapporto di donazione e di misure richieste dall’Interessato (art. 6, par. 1, lett. b): registrazione della donazione, destinazione al progetto scelto, emissione e invio della ricevuta, risposta alle richieste del Donatore;',
          'adempimento di obblighi di legge (art. 6, par. 1, lett. c): obblighi contabili, fiscali e di conservazione delle scritture, inclusa l’eventuale comunicazione all’Agenzia delle Entrate dei dati delle erogazioni liberali ai fini della dichiarazione precompilata, ove prevista per la Cooperativa;',
          'legittimo interesse del Titolare (art. 6, par. 1, lett. f): sicurezza della pagina, prevenzione di abusi e frodi, accertamento, esercizio o difesa di un diritto in sede giudiziaria;',
        ],
      },
      {
        p: 'I dati sono trattati esclusivamente per gestire la donazione ed emettere la ricevuta: non è quindi richiesto il consenso. La casella obbligatoria presente nel modulo attesta unicamente la presa visione della presente informativa. I dati non sono utilizzati per invio di newsletter, comunicazioni promozionali o altre finalità.',
      },
      {
        p: 'La donazione online è riservata a persone maggiorenni. Chi dona per conto di un ente o di un’azienda dichiara di essere autorizzato a farlo e a comunicare i dati del referente indicato.',
      },
    ],
  },
  {
    titolo: '3. FINALITA’ DEL TRATTAMENTO',
    blocchi: [
      { p: 'I dati del Donatore sono trattati per le seguenti finalità:' },
      {
        ul: [
          'registrare la donazione, abbinarla al progetto scelto (o alla destinazione “Dove serve di più”) e verificarne l’accredito;',
          'emettere e inviare via e-mail la ricevuta della donazione;',
          'adempiere agli obblighi contabili, fiscali e di legge connessi alle erogazioni liberali;',
          'rispondere a richieste di informazioni del Donatore;',
          'tutelare i diritti della Cooperativa in caso di contestazioni o contenziosi;',
        ],
      },
      {
        p: 'I dati non sono utilizzati per attività di profilazione né per decisioni basate unicamente su trattamenti automatizzati, e non sono ceduti a terzi per finalità commerciali. I nominativi dei Donatori non sono resi pubblici senza il loro consenso.',
      },
    ],
  },
  {
    titolo: '4. SICUREZZA DEI DATI PERSONALI',
    blocchi: [
      {
        p: 'La Cooperativa adotta misure tecniche e organizzative adeguate, in osservanza dell’art. 32 GDPR, per garantire la riservatezza, l’integrità e la disponibilità dei dati:',
      },
      {
        ul: [
          'trasmissione dei dati dalla pagina web tramite connessione cifrata (HTTPS);',
          'registrazione dei dati in liste SharePoint dell’ambiente Microsoft 365 della Cooperativa, con accesso consentito al solo personale autorizzato tramite credenziali personali;',
          'autorizzazione e formazione del personale che accede ai dati e designazione dei fornitori come Responsabili del trattamento ai sensi dell’art. 28 GDPR.',
        ],
      },
    ],
  },
  {
    titolo: '5. PERIODO DI CONSERVAZIONE DEI DATI',
    blocchi: [
      { p: 'I dati sono conservati per il tempo necessario alle finalità indicate, secondo i seguenti criteri:' },
      {
        ul: [
          'dati della donazione e copia della ricevuta: 10 anni dalla registrazione, in conformità agli obblighi civilistici e fiscali di conservazione (art. 2220 c.c.), salvo un periodo più lungo in caso di contenzioso;',
          'moduli compilati per i quali la donazione non risulta perfezionata: cancellati entro 6 mesi dalla compilazione;',
        ],
      },
      {
        p: 'Allo scadere dei termini indicati, i dati sono cancellati dagli archivi informatici e cartacei secondo procedure tecniche adeguate.',
      },
    ],
  },
  {
    titolo: '6. TRASFERIMENTO INTERNAZIONALE DI DATI',
    blocchi: [
      {
        p: 'I dati inseriti nel modulo sono archiviati esclusivamente nell’ambiente Microsoft 365 della Cooperativa, ospitato in data center situati nell’Unione Europea. La pagina web è erogata dal fornitore di hosting Vercel Inc., con sede negli Stati Uniti: Vercel non memorizza i dati del modulo, che vengono trasmessi tramite connessione cifrata direttamente alle liste SharePoint della Cooperativa; tratta unicamente i dati tecnici di navigazione (ad es. indirizzo IP) necessari al funzionamento e alla sicurezza della pagina.',
      },
      {
        p: 'Eventuali trasferimenti o accessi da Paesi terzi da parte di tali fornitori avvengono sulla base delle garanzie previste dal Capo V del GDPR (artt. 44-50), quali la decisione di adeguatezza relativa all’EU-US Data Privacy Framework per i soggetti certificati e/o le Clausole Contrattuali Standard approvate dalla Commissione Europea.',
      },
    ],
  },
  {
    titolo: '7. CONDIVISIONE DEI DATI PERSONALI',
    blocchi: [
      {
        p: 'Possono accedere ai dati, per le sole finalità indicate, gli addetti della Cooperativa autorizzati al trattamento (amministrazione e referenti della raccolta fondi).',
      },
      { p: 'I dati possono essere trattati inoltre da:' },
      {
        ul: [
          'fornitori designati Responsabili del trattamento ai sensi dell’art. 28 GDPR: Microsoft (servizi Microsoft 365 e SharePoint, in cui sono archiviati i dati), Vercel Inc. (hosting della pagina donazioni, limitatamente ai dati tecnici di navigazione) e l’eventuale consulente che assiste la Cooperativa negli adempimenti contabili e fiscali;',
          'soggetti che operano come autonomi titolari: PayPal e Satispay per i pagamenti effettuati con tali servizi, l’istituto bancario della Cooperativa per i bonifici, l’Agenzia delle Entrate e le altre autorità nei casi previsti dalla legge.',
        ],
      },
      { p: 'L’elenco aggiornato dei Responsabili del trattamento può essere richiesto al Titolare ai recapiti indicati.' },
    ],
  },
  {
    titolo: '8. OBBLIGO DI CONFERIMENTO DEI DATI ED EVENTUALI CONSEGUENZE IN CASO DI RIFIUTO',
    blocchi: [
      {
        p: 'Il conferimento dei dati contrassegnati come obbligatori nel modulo è necessario per registrare la donazione ed emettere la ricevuta: in caso di mancato conferimento non è possibile completare la donazione tramite la pagina.',
      },
    ],
  },
  {
    titolo: '9. TIPOLOGIA DEI DATI PERSONALI RACCOLTI',
    blocchi: [
      { p: 'Sono trattate le seguenti categorie di dati:' },
      {
        ul: [
          'dati anagrafici e identificativi: nome e cognome, codice fiscale, indirizzo; per gli enti, denominazione, codice fiscale o partita IVA e dati del referente;',
          'dati di contatto: indirizzo e-mail;',
          'dati della donazione: importo, data, progetto scelto, metodo di pagamento ed esito; per i bonifici, i dati dell’ordinante;',
          'data e ora di presa visione dell’informativa;',
          'dati tecnici di navigazione (ad es. indirizzo IP, tipo di browser, data e ora di accesso), trattati dal fornitore di hosting per il funzionamento e la sicurezza della pagina.',
        ],
      },
      { p: 'Non sono richiesti dati appartenenti a categorie particolari (art. 9 GDPR).' },
    ],
  },
  {
    titolo: '10. RESPONSABILE DELLA PROTEZIONE DEI DATI',
    blocchi: [
      {
        p: 'Il Titolare ha istituito un Organismo di Controllo per la protezione dei dati, contattabile all’indirizzo ocgdpr@cooperativamirafiori.com.',
      },
    ],
  },
  {
    titolo: '11. DIRITTI DI PROTEZIONE DEI DATI',
    blocchi: [
      {
        p: 'Il Donatore può esercitare in qualsiasi momento i diritti previsti dagli artt. 15-22 GDPR: accesso ai dati, rettifica, cancellazione, limitazione del trattamento, portabilità, opposizione al trattamento basato sul legittimo interesse.',
      },
      { p: 'Le richieste possono essere inviate al Titolare ai recapiti indicati nella presente informativa.' },
    ],
  },
  {
    titolo: '12. MODIFICHE ALL\'INFORMATIVA SULLA PRIVACY',
    blocchi: [
      {
        p: 'La presente informativa può essere aggiornata per recepire modifiche normative, tecnologiche o organizzative. La versione in vigore è sempre pubblicata sulla pagina donazioni e sul sito istituzionale della Cooperativa, con indicazione della data di revisione.',
      },
    ],
  },
  {
    titolo: '13. CANCELLAZIONI, OPPOSIZIONE E RETTIFICHE',
    blocchi: [
      {
        p: 'Il Donatore può chiedere la rettifica o la cancellazione dei propri dati e opporsi al trattamento nei casi previsti. La cancellazione è effettuata quando:',
      },
      {
        ul: [
          'i dati non sono più necessari rispetto alle finalità per cui sono stati raccolti;',
          'il Donatore si oppone al trattamento e non sussistono motivi legittimi prevalenti;',
          'i dati sono stati trattati illecitamente.',
        ],
      },
      {
        p: 'La cancellazione non può riguardare i dati che la Cooperativa è tenuta a conservare per obblighi di legge, per il periodo previsto.',
      },
      {
        p: 'Ai sensi dell’art. 77 GDPR, il Donatore ha il diritto di proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).',
      },
    ],
  },
  {
    titolo: '14. INFORMAZIONI E REVISIONI',
    blocchi: [
      { p: 'Il Titolare del trattamento è responsabile della presente informativa.' },
      { p: 'Versione 1.0 – data di ultima revisione: 03/11/2026.' },
    ],
  },
]

export default function InformativaDonatoriPage() {
  return (
    <main className="min-h-screen">
      <header className="bg-gradient-to-br from-brand-dark to-brand text-white">
        <div className="mx-auto max-w-3xl px-6 pb-10 pt-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-white/75">
            Informativa Donatori – Cooperativa Sociale Mirafiori
          </p>
          <h1 className="mt-3 font-display text-2xl font-bold sm:text-3xl">
            INFORMATIVA PRIVACY DONATORI AI SENSI DEL REGOLAMENTO GENERALE SULLA PROTEZIONE DEI DATI
            (GDPR- GENERAL DATA PROTECTION REGULATION) N. 679/2016
          </h1>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-6 py-10 text-[15px] leading-relaxed text-brand-darker/90">
        <div className="rounded-xl bg-brand-bg p-5 text-center text-sm">
          <p className="font-bold text-brand-darker">Cooperativa Sociale Mirafiori S.C.S.</p>
          <p className="mt-1">
            Sede legale: S.da del Drosso 33/7, 10135 Torino - Tel 0113471263 – 01119176035
          </p>
          <p>ocgdpr@cooperativamirafiori.com - mirafioriscs@pec.confcooperative.it</p>
        </div>

        <p className="mt-6">
          Con questa informativa la Cooperativa Sociale Mirafiori comunica all’Interessato (qui
          denominato “Donatore”) le modalità con cui tratta i dati personali raccolti tramite la
          pagina web dedicata alle donazioni e nella successiva gestione della donazione, come
          prescritto dall’art. 13 del Regolamento europeo n. 679/2016 – GDPR, General Data
          Protection Regulation, dal D.Lgs. 196/2003 come modificato dal D.Lgs. 101/2018 e dalle
          normative vigenti.
        </p>

        <p className="mt-6 font-semibold text-brand-darker">Questi i contenuti dell’Informativa:</p>
        <ol className="mt-2 space-y-0.5 text-sm">
          {INDICE.map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ol>

        {SEZIONI.map((s) => (
          <section key={s.titolo} className="mt-8">
            <h2 className="font-display text-lg font-bold text-brand-darker">{s.titolo}</h2>
            {s.blocchi.map((b, i) =>
              'p' in b ? (
                <p key={i} className="mt-3">
                  {b.p}
                </p>
              ) : (
                <ul key={i} className="mt-3 list-disc space-y-1.5 pl-6">
                  {b.ul.map((li) => (
                    <li key={li}>{li}</li>
                  ))}
                </ul>
              )
            )}
          </section>
        ))}

        <div className="mt-10 flex flex-col items-center gap-3 border-t border-brand/10 pt-6 text-center text-sm">
          <a
            href={INFORMATIVA.pdf}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand underline hover:text-brand-dark"
          >
            Scarica l’informativa in PDF
          </a>
          <Link href="/dona" className="text-brand-darker/70 underline hover:text-brand-darker">
            Torna alla pagina donazioni
          </Link>
        </div>
      </article>

      <footer className="mt-4 bg-gradient-to-br from-brand-dark to-brand py-6 text-center text-white/85">
        <p className="text-sm font-semibold">Versione 1.0 – ultima revisione 03/11/2026</p>
        <p className="mt-1 text-xs text-white/60">
          {COOP.nome} · {COOP.sito}
        </p>
      </footer>
    </main>
  )
}
