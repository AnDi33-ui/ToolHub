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
