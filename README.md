# App Progetto Amazing — Next.js + Microsoft 365 Lists

Riscrittura dell'app di prenotazione beni con donazione liberale (Cooperativa Sociale
Mirafiori) da Google Apps Script / Sheets a **Next.js su Vercel + SharePoint Lists**.

Include: catalogo pubblico, checkout, pagamenti **PayPal**, **Satispay** e **bonifico**,
generazione ricevuta PDF, invio email, area admin protetta da Entra ID.

**Produzione:** https://amazing-mirafiori.vercel.app · repo GitHub `cooperativamirafiori-ux/Amazing`
(deploy automatico a ogni push su `main`). Dati migrati dalla vecchia app (62 beni + 357 prenotazioni).

## Stack

- Next.js 15 (App Router) · React 19 · TypeScript · Tailwind
- Dati: SharePoint Lists via Microsoft Graph (identità applicativa, client credentials)
- Auth admin: Microsoft Entra ID (NextAuth v5)
- Ricevuta PDF: `@react-pdf/renderer` (in-process)
- Email: Microsoft Graph `sendMail` (invio anche a destinatari esterni)

## 1. Creare le liste su SharePoint

Il modo più semplice è lo script: `node scripts/provision-amazing.mjs` crea le tre liste
(`Beni`, `Prenotazioni`, `AmazingAdmin`) con le colonne corrette e stampa i GUID da mettere
in `.env.local`. In alternativa, crea le liste a mano con queste colonne (i **nomi interni**
devono corrispondere: crea la colonna con quel nome, senza spazi).

**Lista `Beni`**

| Colonna | Tipo | Note |
|---|---|---|
| Title | Testo | nome del bene (colonna predefinita) |
| Descrizione | Testo multiriga | |
| Prezzo | Numero/Valuta | donazione minima |
| Quantita | Numero | totale disponibile |
| Venduti | Numero | default 0 (contatore disponibilità) |
| Immagine | Testo/Iperlink | URL immagine |
| ImportoLibero | Sì/No | |
| IdLogico | Testo | id compatibile con lo storico |

**Lista `Prenotazioni`**

| Colonna | Tipo | Note |
|---|---|---|
| Title | Testo | id logico (timestamp) |
| NumeroRicevuta | Testo | assegnato al pagamento |
| GoodId | Testo | |
| GoodName | Testo | |
| Nome, Cognome, Indirizzo, CodiceFiscale, Email | Testo | |
| Importo | Numero/Valuta | |
| Data | Data e ora | |
| Metodo | Testo/Scelta | paypal/satispay/bonifico |
| Stato | Testo/Scelta | pending/paid/annullato/consegnato |
| PdfUrl | Testo/Iperlink | (riservato) |
| SatispayPaymentId | Testo | id pagamento Satispay |
| SatispayStatus | Testo | PENDING/ACCEPTED/CANCELED |
| PaypalOrderId | Testo | id ordine PayPal |

**Lista `AmazingAdmin`** — un solo campo utile: la colonna predefinita `Title` contiene
l'email dell'amministratore (una riga = un admin).

Recupera i **GUID** delle liste (Impostazioni lista → l'URL contiene `List=%7B<guid>%7D`,
oppure via Graph, oppure dall'output di `provision-amazing.mjs`) e mettili in `.env.local`
(`SP_LIST_BENI`, `SP_LIST_PRENOTAZIONI`, `SP_LIST_ADMIN`).

## 2. App Registration (Entra ID)

Una sola App Registration serve sia per il login admin sia per Graph:

- **Redirect URI** (Web): `http://localhost:3000/api/auth/callback/microsoft-entra-id`
  (e l'equivalente su Vercel in produzione)
- **Client secret**: crealo e copialo
- **API permissions (Application)**: `Sites.ReadWrite.All`, `Mail.Send` → poi
  **Grant admin consent**

> Nota privilegio minimo: in produzione valuta `Sites.Selected` limitato al solo sito.

## 3. Configurazione

```bash
cp .env.example .env.local
# compila tutti i valori
```

## 4. Avvio locale

```bash
npm install
npm run dev
# http://localhost:3000        → catalogo pubblico
# http://localhost:3000/admin  → area riservata (login Microsoft)
```

Possono accedere all'area admin le email in `ADMIN_EMAILS` (seme fisso, da env) **più**
quelle nella lista SharePoint `AmazingAdmin`. Questi ultimi si gestiscono al volo dalla
scheda **Amministratori** in `/admin`, senza redeploy.

## Script

- `scripts/provision-amazing.mjs` — crea/aggiorna le tre liste SharePoint e stampa i GUID.
  È idempotente e aggiunge solo le colonne mancanti: **rilancialo** dopo questo aggiornamento
  per creare `SatispayPaymentId`, `SatispayStatus`, `PaypalOrderId` sulla lista `Prenotazioni`.
- `scripts/import-da-vecchia-app.mjs ./beni.csv ./prenotazioni.csv` — importa/sincronizza i
  dati dalla vecchia app (CSV esportati dai fogli Google). **Beni**: sync completa (upsert per
  `IdLogico`: crea i nuovi, aggiorna gli esistenti, disattiva con `Quantita=0` quelli non più
  nel CSV). **Prenotazioni**: idempotente (salta quelle già presenti), poi ricalcola `Venduti`.
  Le immagini `data:` base64 non entrano (colonna testo, max 255) e vengono segnalate.
- `scripts/dump-colonne.mjs` / `scripts/test-create-bene.mjs` — diagnostica delle liste.

## Variabili d'ambiente su Vercel

Impostarle **da terminale** con la Vercel CLI (non dal dashboard, che si è rivelato
inaffidabile). Esempio: `printf '%s' "$VALORE" | npx vercel env add NOME_VAR production`.
Dopo modifiche alle env serve un redeploy (`npx vercel --prod`); verifica con
`npx vercel env pull`.

## Flussi di pagamento

In tutti i casi la prenotazione viene creata riservando la disponibilità (`Venduti`)
con concorrenza ottimistica (ETag). Alla conferma del pagamento il sistema assegna il
numero ricevuta, genera il PDF e lo invia via email al donatore (`lib/completa.ts`).

**Bonifico** — `POST /api/prenotazioni`
1. Il cliente prenota → prenotazione in stato `pending`, riceve IBAN/causale/importo.
2. L'admin, ricevuto il bonifico, imposta lo stato su **Pagato** → ricevuta + email.

**Satispay** (Business API, portata da `Code_v4.gs`) — `lib/satispay.ts`
1. `POST /api/pagamenti/satispay/start` crea la prenotazione e un pagamento Satispay
   (flusso `MATCH_CODE`), poi rimanda l'utente al `redirect_url` di Satispay.
2. Al ritorno su `/pagamento?satispay_booking=<spItemId>`, il client chiama
   `POST /api/pagamenti/satispay/finalize`: se lo stato è `ACCEPTED` completa (ricevuta+email);
   se `CANCELED` rilascia il bene.
3. In parallelo Satispay chiama la callback S2S `POST /api/pagamenti/satispay/callback`
   (idempotente) che completa/annulla anche se l'utente non torna al sito.
4. Autenticazione con HTTP Signature: `keyId` + firma **RSA-SHA256** sugli header
   `(request-target) host date digest`.

**PayPal** (Orders API v2, portata da `Code_v4.gs`) — `lib/paypal.ts`
1. `POST /api/pagamenti/paypal/start` crea la prenotazione e un ordine PayPal (intent
   `CAPTURE`), poi rimanda l'utente al link `approve`.
2. Al ritorno su `/pagamento?paypal_confirm=<spItemId>&token=<orderId>`, il client chiama
   `POST /api/pagamenti/paypal/capture`: verifica `COMPLETED` e la coerenza dell'importo,
   quindi completa (ricevuta+email). La cattura usa `PayPal-Request-Id` come chiave di idempotenza.

> Le credenziali (Satispay `KEY_ID`/chiave privata, PayPal `CLIENT_ID`/`SECRET`) si
> impostano **solo** via variabili d'ambiente (vedi `.env.example`), mai nel codice.
> ⚠️ Il keyId e la chiave privata Satispay erano in chiaro nella vecchia app
> (`Code_v4.gs`): vanno **ruotati** su Satispay Business prima di andare in produzione.

## Note v1 (semplificazioni da rivedere prima della produzione)

- Il PDF viene inviato via email ma **non archiviato** (`PdfUrl` resta vuoto).
  L'archiviazione su SharePoint/OneDrive è prevista dal piano.
- Il numero ricevuta è calcolato come max+1 sulle ricevute esistenti al momento del
  pagamento (le conferme admin sono sequenziali → collisioni trascurabili).
- La firma del rappresentante legale nel PDF è una riga tratteggiata (l'immagine firma
  non è ancora integrata).
- Due beni (POOLIN, Philips) sono importati senza foto (nella vecchia app erano immagini
  base64 incorporate): aggiungere un URL immagine dall'admin.
- L'App Registration Entra ID è condivisa con l'app di cooperativa; valutare un'app dedicata.
