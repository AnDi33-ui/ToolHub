/* ToolHub Backend (migrated full logic) */
const express = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS (credentialed) – allow localhost/127.0.0.1 (any port) + optional PROD_ORIGIN env
const PROD_ORIGIN = process.env.PROD_ORIGIN;
const corsOptions = {
  origin: function(origin, cb){
    if(!origin) return cb(null,true); // same-origin / curl
    const allowedPatterns = [/^http:\/\/localhost(?::\d+)?$/,/^http:\/\/127\.0\.0\.1(?::\d+)?$/];
    if(PROD_ORIGIN){ try { const u=new URL(PROD_ORIGIN); allowedPatterns.push(new RegExp('^'+u.origin.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')); }catch{} }
    if(allowedPatterns.some(re=>re.test(origin))) return cb(null,true);
    return cb(new Error('Not allowed by CORS: '+origin));
  },
  credentials: true,
  allowedHeaders: ['Content-Type','X-Requested-With','x-session-token'],
  methods: ['GET','POST','PUT','DELETE','OPTIONS']
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(cookieParser());
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(helmet());
// HTTP compression (gzip/deflate) for faster delivery of JSON & PDFs (PDF streams already compressed internally)
app.use(compression({ threshold: 1024 }));

// Request ID + logging middleware
app.use((req,res,next)=>{
  const start = Date.now();
  req.id = (crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2);
  res.setHeader('X-Request-Id', req.id);
  const done = ()=>{
    res.removeListener('finish', done);
    res.removeListener('close', done);
    const ms = Date.now()-start;
    const log = { time:new Date().toISOString(), level:'info', id:req.id, method:req.method, url:req.originalUrl, status:res.statusCode, ms };
    console.log(JSON.stringify(log));
  };
  res.on('finish', done);
  res.on('close', done);
  next();
});

// Optional static serving (default NOW false to keep backend "vuoto").
// Set SERVE_STATIC=true to also serve the frontend build from backend.
const SERVE_STATIC = process.env.SERVE_STATIC === 'true';
const FRONTEND_PUBLIC = path.join(__dirname, '..', 'frontend', 'public');

// Root route: always return a minimal JSON descriptor (non‑cliccabile)
app.get('/', (req,res)=>{
  res.json({ ok:true, service:'ToolHub API', static:SERVE_STATIC, version:'0.1.0',
    note:'Questo è solo il backend API. L\'interfaccia web gira su un server statico separato (es. :5173).',
    endpoints:['/health','/api/auth/register','/api/auth/login','/api/export/quote','/api/export/flashcards','/api/analytics','/api/ats'] });
});

// Serve static assets only if explicitly enabled
if (SERVE_STATIC) {
  // If dist exists, serve it with long‑term immutable caching for bundle assets
  const DIST = path.join(FRONTEND_PUBLIC, 'dist');
  if (fs.existsSync(DIST)) {
    app.use('/dist', express.static(DIST, {
      setHeaders: (res, filePath) => {
        if (/\.(js|css)$/.test(filePath)) {
          // Bundled assets (no hash yet -> still allow long max-age; update on deploy)
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));
  }
  // Other public assets with shorter caching (images, icons)
  app.use(express.static(FRONTEND_PUBLIC, {
    setHeaders: (res, filePath) => {
      if (/\.(png|jpg|jpeg|gif|svg|ico|webp)$/.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
      }
    }
  }));
}

// DB path
const DB_PATH = path.join(__dirname, '..', 'data.sqlite');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) return console.error('Failed to open DB', err);
  console.log('Connected to SQLite database.');
});

// Schema creation
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE,is_pro INTEGER DEFAULT 0,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS tool_usage (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,tool_key TEXT,action TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS downloads (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,tool_key TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS ab_events (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,variant TEXT,event TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS waitlist (id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS support_messages (id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT,message TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  // New feature tables
  db.run(`CREATE TABLE IF NOT EXISTS quote_templates (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,name TEXT,payload TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS flashcard_decks (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,name TEXT,cards TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS daily_summaries (id INTEGER PRIMARY KEY AUTOINCREMENT,date TEXT UNIQUE,users INTEGER,usage INTEGER,downloads INTEGER,upsells INTEGER,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS user_pins (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,tool_key TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id,tool_key))`);
  // Sessions + password reset + email verification tables (idempotent)
  db.run(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY,user_id INTEGER,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,last_seen DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS password_resets (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,token TEXT UNIQUE,expires_at DATETIME,used_at DATETIME)`);
  db.run(`CREATE TABLE IF NOT EXISTS email_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,token TEXT UNIQUE,expires_at DATETIME,verified_at DATETIME)`);
  // Attempt to add extra columns to users (ignore failures if already exist)
  const addCol = (name, def) => db.run(`ALTER TABLE users ADD COLUMN ${name} ${def}`, ()=>{});
  addCol('password_hash','TEXT');
  addCol('name','TEXT');
  addCol('marketing_opt_in','INTEGER DEFAULT 0');
  addCol('last_login','DATETIME');
});

// Sessions: legacy map (for old x-session-token) + persistent table
const sessionUsers = new Map();
async function getSessionUser(sid){
  return new Promise((res)=>{ db.get('SELECT user_id FROM sessions WHERE id=?',[sid],(err,row)=>{ if(err||!row) return res(null); res(row.user_id); }); });
}
function setSession(sid,userId){ runAsync('INSERT OR REPLACE INTO sessions (id,user_id,created_at,last_seen) VALUES (?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',[sid,userId]).catch(()=>{}); }
function updateSessionSeen(sid){ runAsync('UPDATE sessions SET last_seen=CURRENT_TIMESTAMP WHERE id=?',[sid]).catch(()=>{}); }
async function requireUser(req,res,next){
  let userId=null;
  if(req.cookies.sid){ userId = await getSessionUser(req.cookies.sid); if(userId) updateSessionSeen(req.cookies.sid); }
  if(!userId){ const token=req.headers['x-session-token']; if(token && sessionUsers.has(token)) userId=sessionUsers.get(token); }
  if(!userId) return res.status(401).json({ok:false,error:'Not logged in'});
  req.userId=userId; next();
}
// A/B cookie assign
app.use((req,res,next)=>{ if(!req.cookies.variant){ res.cookie('variant', Math.random()<0.5?'A':'B', { httpOnly:false,sameSite:'Lax' }); } next(); });

// Rate limiters (basic IP-based)
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20, standardHeaders:true, legacyHeaders:false });
const exportLimiter = rateLimit({ windowMs: 15*60*1000, max: 50, standardHeaders:true, legacyHeaders:false });

// Helpers
function runAsync(sql,p=[]) { return new Promise((res,rej)=> db.run(sql,p,function(err){ err?rej(err):res(this); })); }
function allAsync(sql,p=[]) { return new Promise((res,rej)=> db.all(sql,p,(err,rows)=> err?rej(err):res(rows))); }

// (Old minimal email-only auth removed in favor of password-based implementation below)

app.post('/api/pro/upgrade', requireUser, async (req, res) => {
  try {
    await runAsync('UPDATE users SET is_pro=1 WHERE id=?', [req.userId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// NEW: me endpoint
// ---- AUTH (password-based) ----
function validatePassword(p){ return typeof p==='string' && p.length>=8 && /[A-Za-z]/.test(p) && /\d/.test(p); }
function createSession(res,userId){ const sid=(crypto.randomUUID&&crypto.randomUUID())||crypto.randomBytes(16).toString('hex'); setSession(sid,userId); res.cookie('sid', sid, { httpOnly:true, sameSite:'Lax', secure:false, maxAge:1000*60*60*24*30 }); return sid; }

app.post('/api/auth/register', authLimiter, async (req,res)=>{
  const { email, password, name='', marketingOptIn=false } = req.body||{};
  if(!email || !password) return res.status(400).json({ok:false,error:'email & password required'});
  if(!validatePassword(password)) return res.status(400).json({ok:false,error:'Password debole (>=8, lettera & numero)'});
  try {
    const existing = await allAsync('SELECT id FROM users WHERE email=?',[email]);
    if(existing.length) return res.status(400).json({ok:false,error:'Email già registrata'});
    const hash = await bcrypt.hash(password,12);
    const r = await runAsync('INSERT INTO users (email,password_hash,name,marketing_opt_in) VALUES (?,?,?,?)',[email,hash,name||null, marketingOptIn?1:0]);
    const userId = r.lastID;
    const sid = createSession(res,userId);
    res.json({ ok:true, user:{ email, name, is_pro:false }, sid });
  } catch(e){ res.status(500).json({ok:false,error:e.message}); }
});

app.post('/api/auth/login', authLimiter, async (req,res)=>{
  const { email, password } = req.body||{};
  if(!email || !password) return res.status(400).json({ok:false,error:'email & password required'});
  try {
    const rows = await allAsync('SELECT id,password_hash,is_pro,name FROM users WHERE email=?',[email]);
    if(!rows.length) return res.status(400).json({ok:false,error:'Credenziali non valide'});
    const row = rows[0];
    if(!row.password_hash) return res.status(400).json({ok:false,error:'Account legacy senza password'});
    const ok = await bcrypt.compare(password,row.password_hash);
    if(!ok) return res.status(400).json({ok:false,error:'Credenziali non valide'});
    createSession(res,row.id);
    await runAsync('UPDATE users SET last_login=CURRENT_TIMESTAMP WHERE id=?',[row.id]);
    res.json({ ok:true, user:{ email, name:row.name, is_pro:!!row.is_pro } });
  } catch(e){ res.status(500).json({ok:false,error:e.message}); }
});

app.post('/api/auth/logout', async (req,res)=>{ if(req.cookies.sid){ res.clearCookie('sid'); } res.json({ok:true}); });

app.post('/api/auth/request-reset', authLimiter, async (req,res)=>{
  const { email }=req.body||{}; if(!email) return res.status(400).json({ok:false,error:'email required'});
  try { const rows=await allAsync('SELECT id FROM users WHERE email=?',[email]); if(!rows.length) return res.json({ok:true}); const userId=rows[0].id; const token=crypto.randomBytes(24).toString('hex'); const expires = new Date(Date.now()+1000*60*30).toISOString(); await runAsync('INSERT INTO password_resets (user_id,token,expires_at) VALUES (?,?,?)',[userId,token,expires]); res.json({ok:true, token}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }
});

app.post('/api/auth/reset', authLimiter, async (req,res)=>{
  const { token, password } = req.body||{}; if(!token||!password) return res.status(400).json({ok:false,error:'token & password required'});
  if(!validatePassword(password)) return res.status(400).json({ok:false,error:'Password debole'});
  try { const rows=await allAsync('SELECT id,user_id,expires_at,used_at FROM password_resets WHERE token=?',[token]); if(!rows.length) return res.status(400).json({ok:false,error:'Token invalid'}); const pr=rows[0]; if(pr.used_at) return res.status(400).json({ok:false,error:'Token già usato'}); if(new Date(pr.expires_at)<new Date()) return res.status(400).json({ok:false,error:'Token scaduto'}); const hash=await bcrypt.hash(password,12); await runAsync('UPDATE users SET password_hash=? WHERE id=?',[hash,pr.user_id]); await runAsync('UPDATE password_resets SET used_at=CURRENT_TIMESTAMP WHERE id=?',[pr.id]); res.json({ok:true}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }
});

app.get('/api/auth/me', requireUser, async (req, res) => {
  try {
    const rows = await allAsync('SELECT email,is_pro,name FROM users WHERE id=?', [req.userId]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'not found' });
    res.json({ ok: true, user: { email: rows[0].email, name: rows[0].name, is_pro: !!rows[0].is_pro } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Limits
const BASE_LIMITS={ quoteDownloadsPerDay:3 };
async function checkBaseLimit(userId, toolKey){ if(!userId) return true; const rows=await allAsync('SELECT is_pro FROM users WHERE id=?',[userId]); if(rows.length && rows[0].is_pro) return true; if(toolKey==='quote'){ const day=await allAsync("SELECT COUNT(*) as c FROM downloads WHERE user_id=? AND tool_key='quote' AND DATE(created_at)=DATE('now')",[userId]); return day[0].c < BASE_LIMITS.quoteDownloadsPerDay; } return true; }

// Usage
app.post('/api/usage', async (req, res) => {
  const { userId = null, toolKey, action = 'use' } = req.body;
  try {
    await runAsync('INSERT INTO tool_usage (user_id,tool_key,action) VALUES (?,?,?)', [userId, toolKey, action]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// NEW: daily usage summary for user
app.get('/api/usage/summary', requireUser, async (req, res) => {
  try {
    const day = await allAsync("SELECT COUNT(*) as c FROM downloads WHERE user_id=? AND DATE(created_at)=DATE('now') AND tool_key='quote'", [req.userId]);
    const downloadsToday = day[0]?.c || 0;
    res.json({ ok: true, limits: BASE_LIMITS, usage: { quoteDownloadsToday: downloadsToday } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ATS suggestions
app.get('/api/ats', async (req, res) => {
  const userId = req.query.userId || null;
  try {
    let rows;
    if (userId) {
      rows = await allAsync('SELECT tool_key,COUNT(*) as cnt FROM tool_usage WHERE user_id=? GROUP BY tool_key', [userId]);
    } else {
      rows = await allAsync('SELECT tool_key,COUNT(*) as cnt FROM tool_usage GROUP BY tool_key');
    }
    const suggestions = rows
      .filter(r => r.cnt > 5)
      .map(r => ({ tool: r.tool_key, reason: `Hai usato ${r.cnt} volte` }));
    res.json({ suggestions, upsell: suggestions.length > 0 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Quote export
app.post('/api/export/quote', requireUser, exportLimiter, async (req,res)=>{
  const payload=req.body||{}; const userId=req.userId;
  try{ const allowed=await checkBaseLimit(userId,'quote'); if(!allowed) return res.status(429).json({ok:false,error:'Limite giornaliero raggiunto per piano Base. Passa a Pro per download illimitati.'}); await runAsync('INSERT INTO downloads (user_id,tool_key) VALUES (?,?)',[userId,'quote']); }catch(e){ return res.status(500).json({ok:false,error:e.message}); }
  const doc=new PDFDocument(); res.setHeader('Content-disposition','attachment; filename=quote.pdf'); res.setHeader('Content-type','application/pdf'); doc.pipe(res);
  const primary='#1e3a8a'; const light='#64748b'; const currency=payload.currency||'EUR'; const convertTo = payload.convertTo || null; const rateOverride = parseFloat(payload.rateOverride)||null;
  const STATIC_RATES={ 'EUR_USD':1.07,'USD_EUR':0.93,'EUR_GBP':0.85,'GBP_EUR':1.17 };
  function getRate(from,to){ if(!from||!to||from===to) return 1; if(rateOverride && rateOverride>0) return rateOverride; return STATIC_RATES[`${from}_${to}`]||null; }
  function money(amount,cur=currency){ try{ return new Intl.NumberFormat('it-IT',{style:'currency',currency:cur}).format(Number(amount||0)); }catch{ return (cur==='EUR'?'€':'')+Number(amount||0).toFixed(2);} }
  const logoSize=42; if(payload.logo && typeof payload.logo==='string' && payload.logo.startsWith('data:image')){ try{ doc.image(Buffer.from(payload.logo.split(',')[1],'base64'),40,40,{fit:[logoSize,logoSize]}); }catch{ doc.rect(40,40,logoSize,logoSize).fillOpacity(0.05).fill(primary).fillOpacity(1);} } else { doc.rect(40,40,logoSize,logoSize).fillOpacity(0.05).fill(primary).fillOpacity(1); }
  doc.fillColor(primary).fontSize(22).text('PREVENTIVO',100,48); const today=new Date().toISOString().slice(0,10); doc.fontSize(10).fillColor(light).text(`Data: ${today}`,100,78); doc.fontSize(10).fillColor(light).text(`Documento # ${Math.random().toString(36).slice(2,8).toUpperCase()}`,100,92);
  // Seller & customer
  doc.fontSize(11).fillColor(primary).text('FORNITORE',40,130); doc.fontSize(10).fillColor(light).text((payload.from&&payload.from.name)||'La Mia Azienda',40,146);
  doc.fontSize(11).fillColor(primary).text('CLIENTE',300,130); doc.fontSize(10).fillColor(light).text((payload.to&&payload.to.name)||'Cliente',300,146);
  // Items table
  let items = Array.isArray(payload.items)?payload.items:[]; const startY=200; doc.moveTo(40,startY).lineTo(555,startY).strokeColor(primary).stroke(); doc.fontSize(10).fillColor(primary).text('DESCRIZIONE',45,startY+8); doc.text('QTA',300,startY+8); doc.text('PREZZO',360,startY+8); doc.text('TOTALE',450,startY+8);
  let y=startY+26; let subtotal=0; items.forEach(it=>{ const lineTotal=(Number(it.qty)||0)*(Number(it.price)||0); subtotal+=lineTotal; doc.fillColor('#000').fontSize(10).text(it.desc||'',45,y,{width:240}); doc.text(String(it.qty||''),300,y); doc.text(money(it.price||0),360,y); doc.text(money(lineTotal),450,y); y+=18; if(y>700){ doc.addPage(); y=60; }});
  const taxRate=Number(payload.taxRate)||0; const tax=subtotal*taxRate/100; const total=subtotal+tax; doc.fontSize(10).fillColor(primary); doc.text('SUBTOTALE',360,y+10); doc.text('TASSE',360,y+26); doc.text('TOTALE',360,y+42); doc.fillColor('#000'); doc.text(money(subtotal),450,y+10); doc.text(money(tax),450,y+26); doc.text(money(total),450,y+42);
  // Conversion
  if(convertTo){ const rate=getRate(currency,convertTo); if(rate){ const converted=total*rate; doc.fillColor(primary).fontSize(10).text(`TOTALE (${convertTo})`,360,y+58); doc.fillColor('#000').text(money(converted,convertTo),450,y+58); } }
  // Notes
  if(payload.notes){ doc.moveDown(); doc.addPage(); doc.fontSize(14).fillColor(primary).text('NOTE'); doc.fontSize(11).fillColor('#000').text(payload.notes,{align:'left'}); }
  doc.end();
});

// Quote templates CRUD
app.post('/api/templates/quote', requireUser, async (req,res)=>{ const {name,payload}=req.body||{}; if(!name||!payload) return res.status(400).json({ok:false,error:'name & payload required'}); try{ const r=await runAsync('INSERT INTO quote_templates (user_id,name,payload) VALUES (?,?,?)',[req.userId,name,JSON.stringify(payload)]); res.json({ok:true,id:r.lastID}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});
app.get('/api/templates/quote', requireUser, async (req,res)=>{ try{ const rows=await allAsync('SELECT id,name,payload,created_at FROM quote_templates WHERE user_id=? ORDER BY created_at DESC',[req.userId]); const items=rows.map(r=>({id:r.id,name:r.name,created_at:r.created_at})); res.json({ok:true,items}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});
app.get('/api/templates/quote/:id', requireUser, async (req,res)=>{ try{ const rows=await allAsync('SELECT id,name,payload,created_at FROM quote_templates WHERE id=? AND user_id=?',[req.params.id,req.userId]); if(!rows.length) return res.status(404).json({ok:false,error:'not found'}); let payload; try{ payload=JSON.parse(rows[0].payload);}catch{ payload=rows[0].payload; } res.json({ok:true,item:{id:rows[0].id,name:rows[0].name,payload,created_at:rows[0].created_at}}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});
app.delete('/api/templates/quote/:id', requireUser, async (req,res)=>{ try{ await runAsync('DELETE FROM quote_templates WHERE id=? AND user_id=?',[req.params.id,req.userId]); res.status(204).end(); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});

// Flashcard decks endpoints
app.post('/api/flashcards/deck', requireUser, async (req,res)=>{ const {name,cards}=req.body||{}; if(!name||!Array.isArray(cards)) return res.status(400).json({ok:false,error:'name & cards required'}); try{ const r=await runAsync('INSERT INTO flashcard_decks (user_id,name,cards) VALUES (?,?,?)',[req.userId,name,JSON.stringify(cards)]); res.json({ok:true,id:r.lastID}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});
app.get('/api/flashcards/decks', requireUser, async (req,res)=>{ try{ const rows=await allAsync('SELECT id,name,cards,created_at FROM flashcard_decks WHERE user_id=? ORDER BY created_at DESC',[req.userId]); const items=rows.map(r=>{ let count=0; try{ count=JSON.parse(r.cards).length;}catch{} return {id:r.id,name:r.name,count,created_at:r.created_at}; }); res.json({ok:true,items}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});
app.get('/api/flashcards/deck/:id', requireUser, async (req,res)=>{ try{ const rows=await allAsync('SELECT id,name,cards,created_at FROM flashcard_decks WHERE id=? AND user_id=?',[req.params.id,req.userId]); if(!rows.length) return res.status(404).json({ok:false,error:'not found'}); let cards=[]; try{ cards=JSON.parse(rows[0].cards);}catch{} res.json({ok:true,item:{id:rows[0].id,name:rows[0].name,cards,created_at:rows[0].created_at}}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});

// Pinned tools endpoints
app.post('/api/pins', requireUser, async (req,res)=>{ const {toolKey}=req.body||{}; if(!toolKey) return res.status(400).json({ok:false,error:'toolKey required'}); try{ await runAsync('INSERT OR IGNORE INTO user_pins (user_id,tool_key) VALUES (?,?)',[req.userId,toolKey]); res.json({ok:true}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});
app.get('/api/pins', requireUser, async (req,res)=>{ try{ const rows=await allAsync('SELECT tool_key FROM user_pins WHERE user_id=?',[req.userId]); res.json({ok:true,items:rows.map(r=>r.tool_key)}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});
app.delete('/api/pins/:toolKey', requireUser, async (req,res)=>{ try{ await runAsync('DELETE FROM user_pins WHERE user_id=? AND tool_key=?',[req.userId,req.params.toolKey]); res.status(204).end(); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});

// Analytics CSV export
app.get('/api/analytics/export', async (req,res)=>{ try{ const usage=await allAsync('SELECT tool_key,COUNT(*) as uses FROM tool_usage GROUP BY tool_key'); const downloads=await allAsync('SELECT tool_key,COUNT(*) as downloads FROM downloads GROUP BY tool_key'); const events=await allAsync('SELECT variant,event,COUNT(*) as cnt FROM ab_events GROUP BY variant,event'); let csv='# usage\ntool_key,uses\n'+usage.map(u=>`${u.tool_key},${u.uses}`).join('\n'); csv+='\n\n# downloads\ntool_key,downloads\n'+downloads.map(d=>`${d.tool_key},${d.downloads}`).join('\n'); csv+='\n\n# ab_events\nvariant,event,cnt\n'+events.map(e=>`${e.variant},${e.event},${e.cnt}`).join('\n'); res.setHeader('Content-Type','text/csv'); res.setHeader('Content-Disposition','attachment; filename=analytics.csv'); res.send(csv); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});

// Extended health
app.get('/health/full', async (req,res)=>{ const result={ ok:true, requestId:req.id, version:'0.1.0', timestamp:new Date().toISOString(), db:{read:false,write:false}, memory:{}, counts:{} }; try{ await allAsync('SELECT 1'); result.db.read=true; await runAsync('CREATE TABLE IF NOT EXISTS health_check (id INTEGER)'); result.db.write=true; const users=await allAsync('SELECT COUNT(*) as c FROM users'); const usage=await allAsync('SELECT COUNT(*) as c FROM tool_usage'); const downloads=await allAsync('SELECT COUNT(*) as c FROM downloads'); result.counts={users:users[0]?.c||0,usage:usage[0]?.c||0,downloads:downloads[0]?.c||0}; const mem=process.memoryUsage(); result.memory={rss:mem.rss,heapUsed:mem.heapUsed}; }catch(e){ result.ok=false; result.error=e.message; } res.status(result.ok?200:500).json(result); });

// Conversions
app.post('/api/convert/pdf-to-jpg', multer().single('file'), (req,res)=> res.status(501).json({ok:false,message:'Conversione server-side non implementata in demo.'}));
app.post('/api/convert/jpg-to-pdf', multer().array('files',12), async (req,res)=>{ if(!req.files||!req.files.length) return res.status(400).json({ok:false,error:'Nessuna immagine inviata'}); const doc=new PDFDocument({autoFirstPage:false}); res.setHeader('Content-disposition','attachment; filename=images.pdf'); res.setHeader('Content-type','application/pdf'); doc.pipe(res); req.files.forEach((f,i)=>{ try{ doc.addPage(); doc.image(f.buffer,{fit:[500,720],align:'center',valign:'center'}); }catch(err){ doc.addPage().fontSize(14).fillColor('red').text(`Errore caricando immagine ${i+1}`); } }); doc.end(); });

// Flashcards export
app.post('/api/export/flashcards', async (req,res)=>{ const {cards}=req.body||{}; if(!Array.isArray(cards)||!cards.length) return res.status(400).json({ok:false,error:'cards required'}); const doc=new PDFDocument({margin:40}); res.setHeader('Content-disposition','attachment; filename=flashcards.pdf'); res.setHeader('Content-type','application/pdf'); doc.pipe(res); cards.forEach((c,i)=>{ if(i>0) doc.addPage(); doc.fontSize(18).text(`Card ${i+1}`,{align:'right'}); doc.moveDown(); doc.fontSize(14).text('FRONTE:',{underline:true}); doc.fontSize(12).moveDown(.5).text(c.front||'',{align:'left'}); doc.moveDown(); doc.fontSize(14).text('RETRO:',{underline:true}); doc.fontSize(12).moveDown(.5).text(c.back||'',{align:'left'}); }); doc.end(); });

// Analytics
app.get('/api/analytics', async (req,res)=>{ try{ const usage=await allAsync('SELECT tool_key,COUNT(*) as uses FROM tool_usage GROUP BY tool_key'); const downloads=await allAsync('SELECT tool_key,COUNT(*) as downloads FROM downloads GROUP BY tool_key'); const variants=await allAsync('SELECT variant,COUNT(*) as cnt FROM ab_events GROUP BY variant'); const events=await allAsync('SELECT variant,event,COUNT(*) as cnt FROM ab_events GROUP BY variant,event'); const waitlist=await allAsync('SELECT COUNT(*) as total FROM waitlist'); const messages=await allAsync('SELECT COUNT(*) as total FROM support_messages'); res.json({usage,downloads,variants,events,waitlist:waitlist[0]?.total||0,messages:messages[0]?.total||0}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});

// A/B events
app.post('/api/ab/event', async (req, res) => {
  const { event, variant } = req.body;
  if (!event) return res.status(400).json({ ok: false, error: 'event required' });
  try {
    await runAsync('INSERT INTO ab_events (user_id,variant,event) VALUES (?,?,?)', [null, variant || req.cookies.variant || 'A', event]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Waitlist & contact
app.post('/api/waitlist', async (req,res)=>{ const {email}=req.body; if(!email) return res.status(400).json({ok:false,error:'email required'}); try{ await runAsync('INSERT OR IGNORE INTO waitlist (email) VALUES (?)',[email]); res.json({ok:true}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});
app.post('/api/contact', async (req, res) => {
  const { email, message } = req.body;
  if (!email || !message) {
    return res.status(400).json({ ok: false, error: 'email & message required' });
  }
  try {
    await runAsync('INSERT INTO support_messages (email,message) VALUES (?,?)', [email, message]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Dashboard route (only if static files served)
if (SERVE_STATIC) {
  app.get('/dashboard',(req,res)=> res.sendFile(path.join(FRONTEND_PUBLIC,'dashboard.html')));
}

// Health
app.get('/health',(req,res)=> res.json({ok:true,status:'up'}));

// Fallback 404
app.use((req,res)=> res.status(404).send('Not found'));

app.listen(PORT, ()=> console.log(`ToolHub backend running on http://localhost:${PORT}`));
