# App Progetto Amazing — Next.js + Microsoft 365 Lists

Riscrittura dell'app di prenotazione beni con donazione liberale (Cooperativa Sociale
Mirafiori) da Google Apps Script / Sheets a **Next.js su Vercel + SharePoint Lists**.

Questa è la **versione 1 (core)**: catalogo pubblico, checkout, pagamento **bonifico**,
generazione ricevuta PDF, invio email, area admin protetta da Entra ID.
PayPal e Satispay verranno aggiunti in una fase successiva.

## Stack

- Next.js 15 (App Router) · React 19 · TypeScript · Tailwind
- Dati: SharePoint Lists via Microsoft Graph (identità applicativa, client credentials)
- Auth admin: Microsoft Entra ID (NextAuth v5)
- Ricevuta PDF: `@react-pdf/renderer` (in-process)
- Email: Microsoft Graph `sendMail` (invio anche a destinatari esterni)

## 1. Creare le due liste su SharePoint

Nel sito SharePoint scelto, crea due liste con queste colonne (i **nomi interni**
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

Recupera i **GUID** delle liste (Impostazioni lista → l'URL contiene `List=%7B<guid>%7D`,
oppure via Graph) e mettili in `.env.local`.

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

Solo le email in `ADMIN_EMAILS` possono accedere all'area admin.

## Flusso bonifico (v1)

1. Il cliente prenota dal catalogo → la disponibilità (`Venduti`) viene riservata
   con concorrenza ottimistica (ETag) e viene creata la prenotazione in stato `pending`.
2. Il cliente riceve i dati per il bonifico (IBAN, causale, importo).
3. L'admin, ricevuto il pagamento, imposta lo stato su **Pagato**: il sistema assegna
   il numero ricevuta, genera il PDF e lo invia via email al donatore.

## Note v1 (semplificazioni da rivedere prima della produzione)

- Il PDF viene inviato via email ma **non archiviato** (`PdfUrl` resta vuoto).
  L'archiviazione su SharePoint/OneDrive è prevista dal piano.
- Il numero ricevuta è calcolato come max+1 sulle ricevute esistenti al momento del
  pagamento (le conferme admin sono sequenziali → collisioni trascurabili).
- La firma del rappresentante legale nel PDF è una riga tratteggiata (l'immagine firma
  non è ancora integrata).
- Autorizzazione admin via `ADMIN_EMAILS`; in futuro migrabile a una lista SharePoint.
