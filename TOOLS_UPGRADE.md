# ToolHub – Upgrade Tecnico Strumenti (Ott 2025)

Questo documento riassume gli interventi di professionalizzazione e le linee guida per evoluzioni future.

## Obiettivi raggiunti
- **Utilities condivise**: `apiFetch` (retry, gestione 401, upgrade token legacy), formattazioni (`currencyFormat`, ecc.), sistema toast leggero.
- **Design system coerente**: tipografia, palette, spacing, dark mode, focus accessibile, skeleton loader.
- **InvoiceTool (React)**: validazione righe/cliente, colonna totale, formattazione monetaria, skeleton iniziale, toasts, tracking eventi.
- **QuoteTool (React)**: validazione, conferma sconto alto, formattazione monetaria, logo preview, loading template, toasts.
- **BMI Tool (React)**: riscritto da versione legacy: validazione range, cronologia calcoli, classificazione WHO, tracking, toasts.

## Pattern architetturali
1. **Isolamento API**: ogni chiamata passa da `apiFetch` → punto unico per header, error shaping, evoluzione (rate limit, metrics).  
2. **Stato UI transitorio**: messaggi utente preferibilmente via toast + micro status inline solo quando contestuale.  
3. **Tracking eventi**: batching (flush a 10 eventi o beforeunload) per ridurre overhead rete.  
4. **Formato monetario**: sempre `currencyFormat()`, evitare `.toFixed()` diretto (locale & future multi-currency).  
5. **Validazione**: funzioni pure (`rowsValid`, `validateClient`, ecc.) → facilitano test futuri.  
6. **Accessibilità**: label/aria-label sugli elementi azione, contrasto colori, focus ring custom.

## Prossimi step suggeriti
| Priorità | Area | Azione | Note |
|----------|------|--------|------|
| Alta | FlashcardTool | Refactor in React + persistenza progressi locali | Consente reuse toasts + tracking uniforme |
| Alta | PdfJpgTool | Estrarre logica conversione (adapter pdf.js) + progress bar percentuale reale | Migliora percezione performance |
| Media | TaxesTool | Migrare in React + aggiungere grafico breakdown (mini bar) | Reuse formatter + toasts |
| Media | Auth UX | Modal React unificata per login/register/reset | Riduce duplicazioni HTML |
| Media | QuoteTool | Export JSON / Import JSON + duplicazione riga | Parità feature con flashcards |
| Bassa | Theming | Preferenza tema sincronizzata con sistema (media query) | Miglior polish |
| Bassa | i18n | Introdurre dizionario `t(key)` e fallback | Prepara localizzazione |

## Testing (futuro)
- Unit test su helper (`format.js`, validazioni) → Jest o Vitest rapido.
- Integration smoke: script che fa login test e genera una fattura e un preventivo (già esiste script smoke base, da estendere).

## Manutenzione
- Aggiunta nuovo tool React: creare file in `src/tools`, aggiungere path in `toolEntries` nel build script e mappare key nel loader + card in `toolsApp.jsx`.
- Per strumenti legacy JS restanti, percorso consigliato: migrare gradualmente clonando pattern BMI → poi eliminare duplicati sotto `public/tools`.

## Convenzioni codice
- Evitare `toFixed()` fuori da formattatori centralizzati.
- Sempre `credentials:'include'` nelle API autenticate via `apiFetch` (già incapsulato).
- Errori non bloccanti → toast `warn`; errori operazione → toast `error`; successo → `success`; progress transitorio → `info` timeout breve.

## Debito Tecnico Residuo
- Mancanza test automatici (copertura 0%).
- Mancato hardening rate-limit lato client (exponential backoff oltre 1 retry se 429 design future).
- PdfJpg conversion: memory usage non misurata (grandi PDF?).
- Tracking: nessuna dashboard di consultazione interna (solo endpoint bulk). Potenziale rotta /api/usage/feed.

## Changelog sintetico
- v2.1 Tools pipeline: hashed bundles + pruning + loader dinamico.
- v2.2 Shared utilities + Refactor Invoice/Quote/BMI.
- v2.3 Migrazione Flashcard/PdfJpg/Taxes in React + alias loader + tracking export preventivi/funzionalità conversione migliorata.

## Migrazioni aggiuntive (v2.3)
### FlashcardTool
- Studio con coda adattiva (errori reinseriti), undo ultima azione, statistiche live (accuratezza, tempo, progresso), persistenza localStorage.
- API tracking: start / complete / export JSON / export PDF / import.
- Toast per feedback rapido.

### PdfJpgTool
- Conversione client ottimizzata con progress per pagina e possibilità annulla.
- Slider qualità JPG (50–95%).
- Drag & drop e ZIP (JSZip) se disponibile.
- Tracking eventi: pdf2jpg_complete, jpg2pdf_complete, zip download.

### TaxesTool
- Confronto simultaneo regimi (forfettario / ordinario / flat) e highlight miglior netto.
- Struttura per future espansioni breakdown grafico.
- Tracking stima income.

### Deprecazione script legacy
I file originali JS sotto `public/tools/*.js` sono stati rinominati con suffisso `.legacy.js` dopo migrazione React: mantengono fallback temporaneo per eventuale rollback rapido ma verranno rimossi in una release successiva.

## Tracking aggiunto
- QuoteTool: eventi export (success/error/exception) e template (salvato/errore/exception).
- Flashcard/PdfJpg/Taxes: set iniziale baseline per analisi utilizzo.

## Step Successivo Consigliato
Rimuovere i file `.legacy.js` una volta stabilità confermata (>=1 settimana) e aggiornare Changelog a v2.4 con stato "legacy purge".

---
Ultimo aggiornamento: 2025-10-04
