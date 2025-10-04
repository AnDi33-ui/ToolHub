# ToolHub (demo)

Local demo scaffold for ToolHub — a freemium collection of web tools designed for students, freelancers and small businesses. This repository is a runnable demo (Node.js + Express backend, React UMD frontend) with simple tracking and an ATS (Automatic Targeting System) demo that suggests upgrades to Pro.

Prerequisites
- Node.js v16+ and npm

Quick start (Windows PowerShell)

Backend (API only di default) e Frontend static separato.

```powershell
cd "C:/Users/tripv/OneDrive/Desktop/ToolHub"
npm install
# Avvia solo il backend API (porta 3000, restituisce JSON minimale)
npm run dev

# In un secondo terminale avvia il frontend statico (porta 5173)
npm run frontend
```

Apri l'interfaccia: http://localhost:5173

Il backend su http://localhost:3000 mostra solo una risposta JSON (nessuna UI cliccabile).

Se vuoi che il backend serva anche i file statici (non raccomandato in produzione) esporta la variabile:

```powershell
$env:SERVE_STATIC="true"; npm run dev
```

Notes
- API root (/) ritorna sempre un JSON descrittivo per chiarire che è solo backend.
- Frontend vive in `frontend/public` ed è servito da un semplice static server (live-server) in sviluppo.
- A lightweight SQLite database `data.sqlite` is created at first server start.
- Pro features and payments are NOT integrated — placeholders and server-side demo ATS included.
- See comments in `backend/server.js` and files in `frontend/public/tools/` for extension points.

Next steps / deployment
- Add Stripe/PayPal integration to unlock Pro features.
- Replace client-side demo PDF/image conversions with robust server-side jobs or cloud functions for scale.

## Nuove API avanzate

Endpoint principali aggiunti nella versione 0.1.0 estesa:

| Endpoint | Metodo | Descrizione |
|----------|--------|-------------|
| `/health/full` | GET | Health esteso: stato DB (read/write), counts (users, usage, downloads), memoria processo, requestId. |
| `/api/analytics/export` | GET | Esporta metrica aggregata (usage, downloads, ab_events) in CSV (text/csv). |
| `/api/templates/quote` | POST | Crea un template di preventivo (richiede auth: header `x-session-token`). Body: `{ name, payload }`. |
| `/api/templates/quote` | GET | Lista template dell'utente corrente. |
| `/api/templates/quote/:id` | GET | Dettaglio + payload del template. |
| `/api/templates/quote/:id` | DELETE | Elimina template. |
| `/api/flashcards/deck` | POST | Salva un mazzo di flashcard `{ name, cards:[{front,back},...] }`. |
| `/api/flashcards/decks` | GET | Lista mazzi (id, name, count). |
| `/api/flashcards/deck/:id` | GET | Dettaglio mazzo con cards. |
| `/api/pins` | POST | Aggiunge (o ignora se già presente) un tool ai preferiti dell'utente `{ toolKey }`. |
| `/api/pins` | GET | Lista toolKey pinnati. |
| `/api/pins/:toolKey` | DELETE | Rimuove pin. |

Autenticazione demo: dopo `/api/auth/register` o `/api/auth/login` la risposta contiene `token` da passare in header `x-session-token` per le rotte protette.

## Preventivo multi‑valuta

Rotta: `POST /api/export/quote`

Campi payload supportati (principali):
```
{
	company: { name, address, vat },
	client: "Nome Cliente",
	clientAddress: "Via ...",
	lineItems: [ { desc, qty, price }, ... ],
	vatRate: 22,          // percentuale IVA
	discount: 50,         // sconto assoluto (pre-IVA)
	currency: "EUR",     // valuta base del documento
	convertTo: "USD",     // (opzionale) valuta di conversione mostrata sotto il totale
	rateOverride: 1.08,   // (opzionale) forza il tasso invece dei STATIC_RATES
	notes: "Pagamento a 30 giorni ...",
	logo: "data:image/png;base64,..." // opzionale
}
```
Se `convertTo` è presente e diverso da `currency`, viene calcolato un totale convertito usando:
1. `rateOverride` se > 0
2. altrimenti una tabella statica `STATIC_RATES` (demo) definita in `backend/server.js`.

## Pins (tool preferiti)
Il frontend mostra una sezione "Pinned" se l'utente ha pinnato almeno un tool. Operazioni via `/api/pins` (*auth required*).

## Quote templates
Il componente `QuoteTool.js` consente di salvare e riapplicare un payload completo di preventivo tramite le API `/api/templates/quote*`.

## Flashcard decks
Persistenza server-side dei mazzi per riuso/studio. Le API espongono conteggio card e dettaglio.

## Script di riepilogo giornaliero
File: `scripts/dailySummary.js`. Esegue aggregazione in tabella `daily_summaries` (users, usage, downloads, upsells). Può essere schedulato (es. `node scripts/dailySummary.js` via Task Scheduler / cron).

## Health & Monitoring
- `/health` risponde rapido (ping).
- `/health/full` fornisce diagnostica ampliata per readiness dashboard o probe avanzate.

## CSV Analytics Quick Test
```
curl -v http://localhost:3000/api/analytics/export --output analytics.csv
```
Il file risultante conterrà tre sezioni (# usage, # downloads, # ab_events).

## Sicurezza & Rate Limiting
- `helmet` applicato globalmente.
- Rate limiter per auth e export preventivi (config in `backend/server.js`).

## TODO futuri suggeriti
- Autenticazione robusta (JWT + refresh + password reset).
- Persistenza tassi di cambio (API esterna) e caching.
- Ruoli / RBAC per strumenti avanzati.
- Webhook / integrazione fatturazione reale.
