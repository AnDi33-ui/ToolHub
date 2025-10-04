/* ToolHub - simple Express backend with SQLite, demo ATS and export endpoints
   Comments included to make future extension straightforward.
*/
const express = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(cookieParser());
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Ensure DB file exists (created on first run)
const DB_PATH = path.join(__dirname, 'data.sqlite');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) return console.error('Failed to open DB', err);
  console.log('Connected to SQLite database.');
});

// Create tables if not exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    is_pro INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS tool_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    tool_key TEXT,
    action TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    tool_key TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS ab_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    variant TEXT,
    event TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS waitlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS support_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});
// Simple in-memory session (demo). For production use proper auth + JWT.
const sessionUsers = new Map(); // token -> userId

function requireUser(req, res, next){
  const token = req.headers['x-session-token'];
  if(!token || !sessionUsers.has(token)) return res.status(401).json({ ok:false, error:'Not logged in' });
  req.userId = sessionUsers.get(token);
  next();
}

// A/B variant middleware (assign once via cookie)
app.use((req,res,next)=>{
  if(!req.cookies.variant){
    const variant = Math.random()<0.5? 'A':'B';
    res.cookie('variant', variant, { httpOnly:false, sameSite:'Lax' });
  }
  next();
});

// Auth endpoints
app.post('/api/auth/register', async (req,res)=>{
  const { email } = req.body;
  if(!email) return res.status(400).json({ ok:false, error:'Email required' });
  try {
    await runAsync('INSERT OR IGNORE INTO users (email) VALUES (?)', [email]);
    const rows = await allAsync('SELECT id, is_pro FROM users WHERE email=?',[email]);
    const user = rows[0];
    const token = Math.random().toString(36).slice(2);
    sessionUsers.set(token, user.id);
    res.json({ ok:true, token, user });
  } catch(err){
    res.status(500).json({ ok:false, error: err.message });
  }
});

app.post('/api/auth/login', async (req,res)=>{
  const { email } = req.body;
  if(!email) return res.status(400).json({ ok:false, error:'Email required' });
  try {
    const rows = await allAsync('SELECT id, is_pro FROM users WHERE email=?',[email]);
    if(!rows.length) return res.status(404).json({ ok:false, error:'User not found' });
    const token = Math.random().toString(36).slice(2);
    sessionUsers.set(token, rows[0].id);
    res.json({ ok:true, token, user: rows[0] });
  } catch(err){
    res.status(500).json({ ok:false, error: err.message });
  }
});

// Upgrade to Pro (placeholder - would handle payment)
app.post('/api/pro/upgrade', requireUser, async (req,res)=>{
  try { await runAsync('UPDATE users SET is_pro=1 WHERE id=?',[req.userId]); res.json({ ok:true }); }
  catch(err){ res.status(500).json({ ok:false, error:err.message }); }
});

// Base plan limits (example)
const BASE_LIMITS = {
  quoteDownloadsPerDay: 3
};

async function checkBaseLimit(userId, toolKey){
  if(!userId) return true; // anonymous allowed until later
  const rows = await allAsync('SELECT is_pro FROM users WHERE id=?',[userId]);
  if(rows.length && rows[0].is_pro) return true; // pro unlimited
  if(toolKey==='quote'){
    const dayCount = await allAsync("SELECT COUNT(*) as c FROM downloads WHERE user_id=? AND tool_key='quote' AND DATE(created_at)=DATE('now')", [userId]);
    return dayCount[0].c < BASE_LIMITS.quoteDownloadsPerDay;
  }
  return true;
}

// Simple helper to run queries returning a Promise
function runAsync(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err); else resolve(this);
    });
  });
}

function allAsync(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
}

// API: log tool usage (called by frontend)
app.post('/api/usage', async (req, res) => {
  const { userId = null, toolKey, action = 'use' } = req.body;
  try {
    await runAsync('INSERT INTO tool_usage (user_id, tool_key, action) VALUES (?, ?, ?)', [userId, toolKey, action]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// API: demo ATS - suggest upgrade to Pro based on usage frequency
app.get('/api/ats', async (req, res) => {
  const userId = req.query.userId || null;
  try {
    // For demo: count usage per tool for this user (or global if no user)
    let rows;
    if (userId) {
      rows = await allAsync('SELECT tool_key, COUNT(*) as cnt FROM tool_usage WHERE user_id = ? GROUP BY tool_key', [userId]);
    } else {
      rows = await allAsync('SELECT tool_key, COUNT(*) as cnt FROM tool_usage GROUP BY tool_key');
    }

    // Simple logic: if any tool used > 5 times suggest upgrade
    const suggestions = rows.filter(r => r.cnt > 5).map(r => ({ tool: r.tool_key, reason: `Hai usato ${r.cnt} volte` }));

    // If many uses in short time, strong suggestion
    res.json({ suggestions, upsell: suggestions.length > 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// API: generate a simple quote PDF (demo of server-side PDF generation)
app.post('/api/export/quote', async (req, res) => {
  const payload = req.body || {};
  const token = req.headers['x-session-token'];
  let userId = null;
  if(token && sessionUsers.has(token)) userId = sessionUsers.get(token);
  try {
    const allowed = await checkBaseLimit(userId, 'quote');
    if(!allowed) return res.status(429).json({ ok:false, error:'Limite giornaliero raggiunto per piano Base. Passa a Pro per download illimitati.' });
    if(userId) await runAsync('INSERT INTO downloads (user_id, tool_key) VALUES (?, ?)', [userId, 'quote']);
  } catch(err){
    return res.status(500).json({ ok:false, error: err.message });
  }
  const doc = new PDFDocument();
  res.setHeader('Content-disposition', 'attachment; filename=quote.pdf');
  res.setHeader('Content-type', 'application/pdf');
  doc.pipe(res);
  // ====== STYLES / HELPERS ======
  const primary = '#1e3a8a';
  const light = '#64748b';
  function hr(y){ doc.strokeColor('#e2e8f0').moveTo(40,y).lineTo(555,y).stroke(); }
  const currency = payload.currency || 'EUR';
  function money(n){
    try { return new Intl.NumberFormat('it-IT',{style:'currency',currency}).format(Number(n||0)); }
    catch{ return (currency==='EUR'? '€':'')+Number(n||0).toFixed(2); }
  }

  // ====== HEADER ======
  const logoSize = 42;
  if(payload.logo && typeof payload.logo === 'string' && payload.logo.startsWith('data:image')){
    try { doc.image(Buffer.from(payload.logo.split(',')[1],'base64'),40,40,{fit:[logoSize,logoSize]}); }
    catch { doc.rect(40,40,logoSize,logoSize).fillOpacity(0.05).fill(primary).fillOpacity(1); }
  } else {
    doc.rect(40,40,logoSize,logoSize).fillOpacity(0.05).fill(primary).fillOpacity(1);
  }
  doc.fillColor(primary).fontSize(22).text('PREVENTIVO', 100, 48, { continued:false });
  const today = new Date().toISOString().slice(0,10);
  doc.fontSize(10).fillColor(light).text(`Data: ${today}`, 100, 78);
  doc.fontSize(10).fillColor(light).text(`Documento # ${Math.random().toString(36).slice(2,8).toUpperCase()}`, 100, 92);

  // Company / Client boxes
  const companyY = 120;
  doc.fontSize(11).fillColor(primary).text('FORNITORE', 40, companyY);
  doc.fontSize(9).fillColor(light).text(payload.company?.name || 'Tua Azienda Srl', 40, companyY+14);
  doc.text(payload.company?.address || 'Via Esempio 123\nCity, IT', 40, companyY+28);
  doc.text(`P.IVA: ${payload.company?.vat || 'IT00000000000'}`, 40, companyY+60);

  doc.fontSize(11).fillColor(primary).text('CLIENTE', 320, companyY);
  doc.fontSize(9).fillColor(light).text(payload.client || 'Cliente', 320, companyY+14);
  if(payload.clientAddress) doc.text(payload.clientAddress, 320, companyY+28);

  hr(companyY+84);

  // ====== TABLE HEADER ======
  let tableTop = companyY+100;
  let subtotal = 0;
  const vatRate = parseFloat(payload.vatRate)||0;
  const discount = parseFloat(payload.discount)||0; // absolute amount pre-VAT
  const items = Array.isArray(payload.lineItems) ? payload.lineItems : [];
  if(items.length){
    doc.fontSize(9).fillColor('#334155');
    doc.text('DESCRIZIONE', 40, tableTop);
    doc.text('QTA', 330, tableTop, { width:40, align:'right' });
    doc.text('PREZZO', 380, tableTop, { width:70, align:'right' });
    doc.text('TOTALE', 470, tableTop, { width:70, align:'right' });
    hr(tableTop+14);
    tableTop += 24;
    items.forEach((li,i)=>{
      const qty = parseFloat(li.qty)||1;
      const price = parseFloat(li.price)||0;
      const rowTotal = qty * price;
      subtotal += rowTotal;
      const y = tableTop + i*20;
      if(y>700){
        doc.addPage();
        tableTop = 60; // restart page
      }
      doc.fontSize(9).fillColor('#0f172a').text(li.desc||'Voce',40,y,{width:260});
      doc.text(qty.toString(),330,y,{width:40,align:'right'});
      doc.text(money(price),380,y,{width:70,align:'right'});
      doc.text(money(rowTotal),470,y,{width:70,align:'right'});
    });
  } else {
    doc.fontSize(11).fillColor(primary).text('Descrizione', 40, tableTop);
    doc.fontSize(10).fillColor('#0f172a').text(payload.description || 'N/A', 40, tableTop+16);
    subtotal = parseFloat(payload.total)||0;
  }

  // ====== TOTALS BOX ======
  const discountedSubtotal = Math.max(0, subtotal - discount);
  const vat = discountedSubtotal * (vatRate/100);
  const total = discountedSubtotal + vat;
  const boxY = Math.min(720, tableTop + items.length*20 + 30);
  doc.roundedRect(330, boxY, 210, 90, 6).strokeColor('#cbd5e1').lineWidth(0.8).stroke();
  doc.fontSize(10).fillColor('#334155');
  let lineY = boxY+10;
  doc.text('Subtotale', 340, lineY, { width:100 });
  doc.fontSize(10).fillColor('#334155').text(money(subtotal), 430, lineY, { width:100, align:'right' });
  lineY += 16;
  if(discount>0){
    doc.fontSize(10).fillColor('#334155').text('Sconto', 340, lineY, { width:100 });
    doc.text('-'+money(discount), 430, lineY, { width:100, align:'right' });
    lineY += 16;
  }
  doc.fontSize(10).fillColor('#334155').text('IVA '+vatRate.toFixed(2)+'%', 340, lineY, { width:100 });
  doc.text(money(vat), 430, lineY, { width:100, align:'right' });
  lineY += 22;
  doc.fontSize(11).fillColor(primary).text('TOTALE', 340, lineY, { width:100 });
  doc.fontSize(11).fillColor(primary).text(money(total), 430, lineY, { width:100, align:'right' });

  // ====== NOTES / TERMS ======
  const notesY = boxY - 4;
  doc.fontSize(9).fillColor(primary).text('Note / Termini', 40, notesY);
  doc.fontSize(8).fillColor(light).text(payload.notes || 'Pagamento a 30 giorni. Offerta valida 15 giorni salvo diversa indicazione.', 40, notesY+14, { width:250 });

  // Footer
  doc.fontSize(7).fillColor('#94a3b8').text('Generato con ToolHub (demo) - Questo documento non sostituisce un documento fiscale ufficiale.', 40, 780, { align:'center', width:515 });

  doc.end();
});

// API: placeholder for PDF<->JPG conversion. In production replace with robust worker
app.post('/api/convert/pdf-to-jpg', multer().single('file'), (req, res) => {
  // For demo: respond with not-implemented but log the attempt
  res.status(501).json({ ok: false, message: 'Conversione server-side non implementata in demo. Implementare con imagemagick/gm or cloud service.' });
});

// API: JPG->PDF combine multiple images into single PDF
app.post('/api/convert/jpg-to-pdf', multer().array('files', 12), async (req,res)=>{
  if(!req.files || !req.files.length) return res.status(400).json({ ok:false, error:'Nessuna immagine inviata' });
  const doc = new PDFDocument({ autoFirstPage:false });
  res.setHeader('Content-disposition', 'attachment; filename=images.pdf');
  res.setHeader('Content-type','application/pdf');
  doc.pipe(res);
  req.files.forEach((f,idx)=>{
    try {
      doc.addPage();
      // Fit image maintaining aspect ratio
      doc.image(f.buffer, { fit:[500,720], align:'center', valign:'center' });
    } catch(err){
      doc.addPage().fontSize(14).fillColor('red').text(`Errore caricando immagine ${idx+1}`);
    }
  });
  doc.end();
});

// Flashcards export PDF
app.post('/api/export/flashcards', async (req,res)=>{
  const { cards } = req.body || {};
  if(!Array.isArray(cards) || !cards.length) return res.status(400).json({ ok:false, error:'cards required' });
  const doc = new PDFDocument({ margin:40 });
  res.setHeader('Content-disposition','attachment; filename=flashcards.pdf');
  res.setHeader('Content-type','application/pdf');
  doc.pipe(res);
  cards.forEach((c,i)=>{
    if(i>0) doc.addPage();
    doc.fontSize(18).text(`Card ${i+1}`, { align:'right' });
    doc.moveDown();
    doc.fontSize(14).text('FRONTE:', { underline:true });
    doc.fontSize(12).moveDown(.5).text(c.front||'', { align:'left' });
    doc.moveDown();
    doc.fontSize(14).text('RETRO:', { underline:true });
    doc.fontSize(12).moveDown(.5).text(c.back||'', { align:'left' });
  });
  doc.end();
});

// API: simple analytics endpoint for demo dashboard
app.get('/api/analytics', async (req, res) => {
  try {
    const usage = await allAsync('SELECT tool_key, COUNT(*) as uses FROM tool_usage GROUP BY tool_key');
    const downloads = await allAsync('SELECT tool_key, COUNT(*) as downloads FROM downloads GROUP BY tool_key');
    const variants = await allAsync('SELECT variant, COUNT(*) as cnt FROM ab_events GROUP BY variant');
    const events = await allAsync('SELECT variant, event, COUNT(*) as cnt FROM ab_events GROUP BY variant, event');
    const waitlist = await allAsync('SELECT COUNT(*) as total FROM waitlist');
    const messages = await allAsync('SELECT COUNT(*) as total FROM support_messages');
    res.json({ usage, downloads, variants, events, waitlist: waitlist[0]?.total||0, messages: messages[0]?.total||0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// A/B event tracking
app.post('/api/ab/event', async (req,res)=>{
  const { event, variant } = req.body;
  if(!event) return res.status(400).json({ ok:false, error:'event required' });
  try {
    await runAsync('INSERT INTO ab_events (user_id, variant, event) VALUES (?,?,?)',[null, variant||req.cookies.variant||'A', event]);
    res.json({ ok:true });
  } catch(err){ res.status(500).json({ ok:false, error:err.message }); }
});

// Waitlist
app.post('/api/waitlist', async (req,res)=>{
  const { email } = req.body;
  if(!email) return res.status(400).json({ ok:false, error:'email required' });
  try { await runAsync('INSERT OR IGNORE INTO waitlist (email) VALUES (?)',[email]); res.json({ ok:true }); }
  catch(err){ res.status(500).json({ ok:false, error:err.message }); }
});

// Contact messages
app.post('/api/contact', async (req,res)=>{
  const { email, message } = req.body;
  if(!email || !message) return res.status(400).json({ ok:false, error:'email & message required' });
  try { await runAsync('INSERT INTO support_messages (email,message) VALUES (?,?)',[email,message]); res.json({ ok:true }); }
  catch(err){ res.status(500).json({ ok:false, error:err.message }); }
});

// Simple endpoint that the dashboard page can use
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Fallback
app.use((req, res) => {
  res.status(404).send('Not found');
});

app.listen(PORT, () => console.log(`ToolHub demo running on http://localhost:${PORT}`));
