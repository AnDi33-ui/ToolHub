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
let nodemailer = null; try { nodemailer = require('nodemailer'); } catch {}

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
  addCol('last_invoice_seq','INTEGER DEFAULT 0');
  // New tables: clients & invoices
  db.run(`CREATE TABLE IF NOT EXISTS clients (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,name TEXT NOT NULL,vat TEXT,address TEXT,notes TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS invoices (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,client_id INTEGER,number TEXT,total REAL,currency TEXT,status TEXT DEFAULT 'draft',payload TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  // Business profile (one row per user)
  db.run(`CREATE TABLE IF NOT EXISTS business_profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE,
    regime_fiscale TEXT,
    piva TEXT,
    codice_fiscale TEXT,
    ragione_sociale TEXT,
    indirizzo TEXT,
    cap TEXT,
    citta TEXT,
    provincia TEXT,
    nazione TEXT,
    aliquota_iva_default REAL,
    currency_default TEXT,
    note_footer_default TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_business_profile_user ON business_profile(user_id)`);
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
  let hadCookie=false;
  if(req.cookies.sid){ hadCookie=true; userId = await getSessionUser(req.cookies.sid); if(userId) updateSessionSeen(req.cookies.sid); }
  if(!userId){
    const token=req.headers['x-session-token'];
    if(token && sessionUsers.has(token)){
      userId=sessionUsers.get(token);
      // Upgrade path: create a proper sid cookie so future requests rely on cookie
      if(userId && !hadCookie){
        const sid=(crypto.randomUUID&&crypto.randomUUID())||crypto.randomBytes(16).toString('hex');
        setSession(sid,userId);
        res.cookie('sid', sid, { httpOnly:true, sameSite:'Lax', secure:false, maxAge:1000*60*60*24*30 });
        if(process.env.AUTH_DEBUG==='1') console.log('[auth-upgrade] issued sid for legacy token user', userId);
      }
    }
  }
  if(!userId){
    if(process.env.AUTH_DEBUG==='1') console.log('[auth-fail] no session for request', req.method, req.originalUrl, 'cookies?', !!req.cookies.sid);
    return res.status(401).json({ok:false,error:'Not logged in'});
  }
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
function formatMoney(amount,currency='EUR'){ try{ return new Intl.NumberFormat('it-IT',{style:'currency',currency}).format(Number(amount||0)); }catch{ return (currency==='EUR'?'€':'')+Number(amount||0).toFixed(2);} }

// --- Template Engine (simple placeholder replacement) ---
// Supported placeholders: {{company.name}} {{company.address}} {{company.piva}} {{company.codice_fiscale}} {{company.regime_fiscale}}
// {{defaults.vatRate}} {{defaults.currency}} {{defaults.noteFooter}} {{client.name}} {{client.address}} {{today}}
// Unknown placeholders => replaced with '' and logged in debug mode (NODE_ENV!=='production')
async function getBusinessProfile(userId){
  try { const rows = await allAsync('SELECT * FROM business_profile WHERE user_id=?',[userId]); return rows.length? rows[0]: null; } catch { return null; }
}
function buildTemplateContext({ profile, client=null }){
  const today = new Date().toISOString().slice(0,10);
  const company = {
    name: profile?.ragione_sociale || 'La Mia Azienda',
    address: profile?.indirizzo || '',
    piva: profile?.piva || '',
    codice_fiscale: profile?.codice_fiscale || '',
    regime_fiscale: profile?.regime_fiscale || ''
  };
  const defaults = {
    vatRate: profile?.aliquota_iva_default ?? '',
    currency: profile?.currency_default || 'EUR',
    noteFooter: profile?.note_footer_default || ''
  };
  return { company, client: client || {}, defaults, today };
}
function applyTemplate(str, ctx){
  if(!str || typeof str!=='string') return str;
  return str.replace(/{{\s*([a-zA-Z0-9_\.]+)\s*}}/g, (m, key)=>{
    const parts = key.split('.');
    let cur = ctx;
    for(const p of parts){ if(cur && Object.prototype.hasOwnProperty.call(cur,p)) cur=cur[p]; else { if(process.env.NODE_ENV!=='production') console.log('[template] placeholder ignoto', key); return ''; } }
    if(cur==null) return '';
    return String(cur);
  });
}


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
  let { email, password, name='', marketingOptIn=false } = req.body||{};
  if(!email || !password) return res.status(400).json({ok:false,error:'email & password required', code:'MISSING_FIELDS'});
  email = String(email).trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ok:false,error:'Email non valida', code:'INVALID_EMAIL'});
  if(!validatePassword(password)) return res.status(400).json({ok:false,error:'Password debole (>=8, lettera & numero)', code:'WEAK_PASSWORD'});
  try {
    const existing = await allAsync('SELECT id FROM users WHERE email=?',[email]);
    if(existing.length) return res.status(400).json({ok:false,error:'Email già registrata', code:'EMAIL_EXISTS'});
    const hash = await bcrypt.hash(password,12);
    const r = await runAsync('INSERT INTO users (email,password_hash,name,marketing_opt_in) VALUES (?,?,?,?)',[email,hash,name||null, marketingOptIn?1:0]);
    const userId = r.lastID;
  const sid = createSession(res,userId);
  res.json({ ok:true, user:{ email, name, is_pro:false }, session:{ id: sid } });
  } catch(e){ res.status(500).json({ok:false,error:'Errore interno', code:'SERVER_ERROR'}); }
});

app.post('/api/auth/login', authLimiter, async (req,res)=>{
  let { email, password } = req.body||{};
  if(!email || !password) return res.status(400).json({ok:false,error:'email & password required', code:'MISSING_FIELDS'});
  email = String(email).trim().toLowerCase();
  try {
    const rows = await allAsync('SELECT id,password_hash,is_pro,name FROM users WHERE email=?',[email]);
    if(!rows.length) return res.status(400).json({ok:false,error:'Credenziali non valide', code:'INVALID_CREDENTIALS'});
    const row = rows[0];
    if(!row.password_hash) return res.status(400).json({ok:false,error:'Account legacy senza password', code:'LEGACY_ACCOUNT'});
    const ok = await bcrypt.compare(password,row.password_hash);
    if(!ok) return res.status(400).json({ok:false,error:'Credenziali non valide', code:'INVALID_CREDENTIALS'});
  const sid = createSession(res,row.id);
    await runAsync('UPDATE users SET last_login=CURRENT_TIMESTAMP WHERE id=?',[row.id]);
  res.json({ ok:true, user:{ email, name:row.name, is_pro:!!row.is_pro }, session:{ id: sid } });
  } catch(e){ res.status(500).json({ok:false,error:'Errore interno', code:'SERVER_ERROR'}); }
});

app.post('/api/auth/logout', async (req,res)=>{ if(req.cookies.sid){ res.clearCookie('sid'); } res.json({ok:true}); });

app.post('/api/auth/request-reset', authLimiter, async (req,res)=>{
  let { email }=req.body||{}; if(!email) return res.status(400).json({ok:false,error:'email required',code:'MISSING_FIELDS'});
  email=String(email).trim().toLowerCase();
  try {
    const rows=await allAsync('SELECT id FROM users WHERE email=?',[email]);
    if(rows.length){
      const userId=rows[0].id;
      const token=crypto.randomBytes(24).toString('hex');
      const expires = new Date(Date.now()+1000*60*30).toISOString();
      await runAsync('INSERT INTO password_resets (user_id,token,expires_at) VALUES (?,?,?)',[userId,token,expires]);
      // Build reset link (frontend expected at /?resetToken=TOKEN&email=EMAIL or separate page)
      const origin = process.env.PUBLIC_WEB_ORIGIN || 'http://localhost:5173';
      const resetUrl = `${origin}/?resetToken=${token}&email=${encodeURIComponent(email)}`;
      // Send email if transporter configured
      const canSend = nodemailer && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;
      if(canSend){
        try {
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
            secure: !!process.env.SMTP_SECURE, // true for 465
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          });
          await transporter.sendMail({
            from: process.env.MAIL_FROM || 'no-reply@toolhub.local',
            to: email,
            subject: 'Reset password ToolHub',
            text: `Hai richiesto un reset password. Link valido 30 minuti.\n\n${resetUrl}\n\nSe non hai richiesto tu ignora questo messaggio.`,
            html: `<p>Hai richiesto un reset password. Clicca il bottone (valido 30 minuti):</p><p><a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;">Reset Password</a></p><p>Oppure copia questo link:</p><code style="font-size:12px;">${resetUrl}</code><p>Se non l'hai richiesto ignora questa email.</p>`
          });
        } catch(mailErr){ console.error('Email send failed', mailErr); }
      } else {
        console.log('[debug] Reset link (no SMTP configured):', resetUrl);
      }
      const resp={ok:true}; if(process.env.NODE_ENV!=='production') resp.debugToken=token; res.json(resp);
      return;
    }
    // Always respond ok to avoid user enumeration
    res.json({ok:true});
  }catch(e){ res.status(500).json({ok:false,error:'Errore interno',code:'SERVER_ERROR'}); }
});

app.post('/api/auth/reset', authLimiter, async (req,res)=>{
  const { token, password } = req.body||{}; if(!token||!password) return res.status(400).json({ok:false,error:'token & password required',code:'MISSING_FIELDS'});
  if(!validatePassword(password)) return res.status(400).json({ok:false,error:'Password debole',code:'WEAK_PASSWORD'});
  try { const rows=await allAsync('SELECT id,user_id,expires_at,used_at FROM password_resets WHERE token=?',[token]); if(!rows.length) return res.status(400).json({ok:false,error:'Token invalido',code:'INVALID_TOKEN'}); const pr=rows[0]; if(pr.used_at) return res.status(400).json({ok:false,error:'Token già usato',code:'TOKEN_USED'}); if(new Date(pr.expires_at)<new Date()) return res.status(400).json({ok:false,error:'Token scaduto',code:'TOKEN_EXPIRED'}); const hash=await bcrypt.hash(password,12); await runAsync('UPDATE users SET password_hash=? WHERE id=?',[hash,pr.user_id]); await runAsync('UPDATE password_resets SET used_at=CURRENT_TIMESTAMP WHERE id=?',[pr.id]); res.json({ok:true}); }catch(e){ res.status(500).json({ok:false,error:'Errore interno',code:'SERVER_ERROR'}); }
});

// Change password (authenticated)
app.post('/api/auth/change-password', requireUser, authLimiter, async (req,res)=>{
  const { currentPassword, newPassword } = req.body||{};
  if(!currentPassword || !newPassword) return res.status(400).json({ok:false,error:'campi richiesti',code:'MISSING_FIELDS'});
  if(!validatePassword(newPassword)) return res.status(400).json({ok:false,error:'Password debole',code:'WEAK_PASSWORD'});
  try {
    const rows = await allAsync('SELECT password_hash FROM users WHERE id=?',[req.userId]);
    if(!rows.length || !rows[0].password_hash) return res.status(400).json({ok:false,error:'Account non valido',code:'INVALID_ACCOUNT'});
    const ok = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if(!ok) return res.status(400).json({ok:false,error:'Password attuale errata',code:'INVALID_CREDENTIALS'});
    const hash = await bcrypt.hash(newPassword,12);
    await runAsync('UPDATE users SET password_hash=? WHERE id=?',[hash,req.userId]);
    res.json({ok:true});
  } catch(e){ res.status(500).json({ok:false,error:'Errore interno',code:'SERVER_ERROR'}); }
});

app.get('/api/auth/me', requireUser, async (req, res) => {
  try {
    const rows = await allAsync('SELECT email,is_pro,name,marketing_opt_in FROM users WHERE id=?', [req.userId]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'not found' });
    const r = rows[0];
    res.json({ ok: true, user: { email: r.email, name: r.name, is_pro: !!r.is_pro, marketingOptIn: !!r.marketing_opt_in } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- Business Profile ----
function normalizeProfileInput(body){
  const allowedRegimi = ['forfettario','ordinario','flat'];
  const profile = {};
  if(body.regime_fiscale && allowedRegimi.includes(String(body.regime_fiscale).toLowerCase())) profile.regime_fiscale = String(body.regime_fiscale).toLowerCase();
  if(body.piva) profile.piva = String(body.piva).trim().toUpperCase();
  if(body.codice_fiscale) profile.codice_fiscale = String(body.codice_fiscale).trim().toUpperCase();
  const strFields = ['ragione_sociale','indirizzo','cap','citta','provincia','nazione','note_footer_default','currency_default'];
  strFields.forEach(f=>{ if(body[f]!=null) profile[f]= String(body[f]).slice(0,180); });
  if(body.aliquota_iva_default!=null){ const v = Number(body.aliquota_iva_default); if(!isNaN(v) && v>=0 && v<=100) profile.aliquota_iva_default = v; }
  return profile;
}

app.get('/api/profile', requireUser, async (req,res)=>{
  try {
    const rows = await allAsync('SELECT * FROM business_profile WHERE user_id=?',[req.userId]);
    if(!rows.length) return res.json({ ok:true, profile:null });
    res.json({ ok:true, profile: rows[0] });
  } catch(e){ res.status(500).json({ ok:false, error:e.message }); }
});

app.put('/api/profile', requireUser, async (req,res)=>{
  try {
    const data = normalizeProfileInput(req.body||{});
    if(!Object.keys(data).length) return res.status(400).json({ ok:false, error:'No valid fields' });
    // Upsert logic
    const existing = await allAsync('SELECT id FROM business_profile WHERE user_id=?',[req.userId]);
    const now = new Date().toISOString();
    if(existing.length){
      const sets = Object.keys(data).map(k=> `${k}=?`);
      sets.push('updated_at=?');
      await runAsync(`UPDATE business_profile SET ${sets.join(',')} WHERE user_id=?`, [...Object.values(data), now, req.userId]);
    } else {
      data.user_id = req.userId; data.created_at = now; data.updated_at = now;
      const cols = Object.keys(data); const placeholders = cols.map(()=>'?');
      await runAsync(`INSERT INTO business_profile (${cols.join(',')}) VALUES (${placeholders.join(',')})`, Object.values(data));
    }
    const out = await allAsync('SELECT * FROM business_profile WHERE user_id=?',[req.userId]);
    res.json({ ok:true, profile: out[0] });
  } catch(e){ res.status(500).json({ ok:false, error:e.message }); }
});

// Profile update (name, marketing opt-in)
app.post('/api/profile/update', requireUser, async (req,res)=>{
  const { name, marketingOptIn } = req.body||{};
  try {
    await runAsync('UPDATE users SET name=COALESCE(?,name), marketing_opt_in=COALESCE(?,marketing_opt_in) WHERE id=?', [
      typeof name === 'string' ? name : null,
      typeof marketingOptIn === 'boolean' ? (marketingOptIn?1:0) : null,
      req.userId
    ]);
    const rows = await allAsync('SELECT email,is_pro,name,marketing_opt_in FROM users WHERE id=?',[req.userId]);
    const u = rows[0];
    res.json({ ok:true, user:{ email:u.email, name:u.name, is_pro:!!u.is_pro, marketingOptIn:!!u.marketing_opt_in } });
  } catch(e){ res.status(500).json({ok:false,error:'Errore interno',code:'SERVER_ERROR'}); }
});

// ---- Clients CRUD ----
app.post('/api/clients', requireUser, async (req,res)=>{
  const { name, vat='', address='', notes='' } = req.body||{};
  if(!name || !name.trim()) return res.status(400).json({ok:false,error:'name required'});
  try {
    const r = await runAsync('INSERT INTO clients (user_id,name,vat,address,notes) VALUES (?,?,?,?,?)',[req.userId,name.trim(),vat||null,address||null,notes||null]);
    res.json({ok:true,id:r.lastID});
  } catch(e){ res.status(500).json({ok:false,error:e.message}); }
});
app.get('/api/clients', requireUser, async (req,res)=>{
  try { const rows = await allAsync('SELECT id,name,vat,address,notes,created_at FROM clients WHERE user_id=? ORDER BY created_at DESC',[req.userId]); res.json({ok:true,items:rows}); } catch(e){ res.status(500).json({ok:false,error:e.message}); }
});
app.put('/api/clients/:id', requireUser, async (req,res)=>{
  const { name, vat, address, notes } = req.body||{}; const id=req.params.id;
  try { await runAsync('UPDATE clients SET name=COALESCE(?,name), vat=COALESCE(?,vat), address=COALESCE(?,address), notes=COALESCE(?,notes) WHERE id=? AND user_id=?',[name,vat,address,notes,id,req.userId]); res.json({ok:true}); } catch(e){ res.status(500).json({ok:false,error:e.message}); }
});
app.delete('/api/clients/:id', requireUser, async (req,res)=>{
  try { await runAsync('DELETE FROM clients WHERE id=? AND user_id=?',[req.params.id,req.userId]); res.status(204).end(); } catch(e){ res.status(500).json({ok:false,error:e.message}); }
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
  const profile = await getBusinessProfile(userId);
  const ctx = buildTemplateContext({ profile, client: { name: payload.client || payload.clientName || (payload.client && payload.client.name) || 'Cliente', address: payload.clientAddress || '' } });
  // Merge defaults for missing currency / vat / notes
  if(!payload.currency && ctx.defaults.currency) payload.currency = ctx.defaults.currency;
  if((payload.taxRate==null || payload.taxRate==='') && ctx.defaults.vatRate!=='') payload.taxRate = ctx.defaults.vatRate;
  if(!payload.notes && ctx.defaults.noteFooter) payload.notes = ctx.defaults.noteFooter;
  // Apply template placeholders in notes (and optional company fields if passed as strings with placeholders)
  if(payload.notes) payload.notes = applyTemplate(payload.notes, ctx);
  const doc=new PDFDocument(); res.setHeader('Content-disposition','attachment; filename=quote.pdf'); res.setHeader('Content-type','application/pdf'); doc.pipe(res);
  const primary='#1e3a8a'; const light='#64748b'; const currency=payload.currency||'EUR'; const convertTo = payload.convertTo || null; const rateOverride = parseFloat(payload.rateOverride)||null;
  const STATIC_RATES={ 'EUR_USD':1.07,'USD_EUR':0.93,'EUR_GBP':0.85,'GBP_EUR':1.17 };
  function getRate(from,to){ if(!from||!to||from===to) return 1; if(rateOverride && rateOverride>0) return rateOverride; return STATIC_RATES[`${from}_${to}`]||null; }
  function money(amount,cur=currency){ try{ return new Intl.NumberFormat('it-IT',{style:'currency',currency:cur}).format(Number(amount||0)); }catch{ return (cur==='EUR'?'€':'')+Number(amount||0).toFixed(2);} }
  const logoSize=42; if(payload.logo && typeof payload.logo==='string' && payload.logo.startsWith('data:image')){ try{ doc.image(Buffer.from(payload.logo.split(',')[1],'base64'),40,40,{fit:[logoSize,logoSize]}); }catch{ doc.rect(40,40,logoSize,logoSize).fillOpacity(0.05).fill(primary).fillOpacity(1);} } else { doc.rect(40,40,logoSize,logoSize).fillOpacity(0.05).fill(primary).fillOpacity(1); }
  doc.fillColor(primary).fontSize(22).text('PREVENTIVO',100,48); const today=new Date().toISOString().slice(0,10); doc.fontSize(10).fillColor(light).text(`Data: ${today}`,100,78); doc.fontSize(10).fillColor(light).text(`Documento # ${Math.random().toString(36).slice(2,8).toUpperCase()}`,100,92);
  // Seller & customer using profile + context
  doc.fontSize(11).fillColor(primary).text('FORNITORE',40,130);
  const companyLine = ctx.company.name + (ctx.company.piva? ` (P.IVA ${ctx.company.piva})`: '');
  doc.fontSize(10).fillColor(light).text(companyLine,40,146);
  if(ctx.company.address) doc.text(ctx.company.address,40,160);
  doc.fontSize(11).fillColor(primary).text('CLIENTE',300,130);
  doc.fontSize(10).fillColor(light).text(ctx.client.name||'Cliente',300,146);
  if(ctx.client.address) doc.text(ctx.client.address,300,160);
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
app.get('/api/flashcards/deck/:id', requireUser, async (req, res) => {
  try {
    const rows = await allAsync(
      'SELECT id,name,cards,created_at FROM flashcard_decks WHERE id=? AND user_id=?',
      [req.params.id, req.userId]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'not found' });
    }
    let cards = [];
    try {
      cards = JSON.parse(rows[0].cards);
    } catch (e) {
      // ignore parse error
    }
    return res.json({
      ok: true,
      item: {
        id: rows[0].id,
        name: rows[0].name,
        cards,
        created_at: rows[0].created_at
      }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Pinned tools endpoints
app.post('/api/pins', requireUser, async (req,res)=>{ const {toolKey}=req.body||{}; if(!toolKey) return res.status(400).json({ok:false,error:'toolKey required'}); try{ await runAsync('INSERT OR IGNORE INTO user_pins (user_id,tool_key) VALUES (?,?)',[req.userId,toolKey]); res.json({ok:true}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});
app.get('/api/pins', requireUser, async (req,res)=>{ try{ const rows=await allAsync('SELECT tool_key FROM user_pins WHERE user_id=?',[req.userId]); res.json({ok:true,items:rows.map(r=>r.tool_key)}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});
app.delete('/api/pins/:toolKey', requireUser, async (req,res) => {
  try {
    await runAsync('DELETE FROM user_pins WHERE user_id=? AND tool_key=?',[req.userId, req.params.toolKey]);
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

// ---- Invoices ----
app.post('/api/invoices', requireUser, async (req,res)=>{
  const { clientId, items=[], taxRate=0, currency='EUR', notes='' } = req.body||{};
  if(!clientId) return res.status(400).json({ok:false,error:'clientId required'});
  try {
    const clientRows = await allAsync('SELECT id,name,vat,address FROM clients WHERE id=? AND user_id=?',[clientId,req.userId]);
    if(!clientRows.length) return res.status(404).json({ok:false,error:'client not found'});
    // increment invoice seq
    await runAsync('UPDATE users SET last_invoice_seq = COALESCE(last_invoice_seq,0) + 1 WHERE id=?',[req.userId]);
    const urow = await allAsync('SELECT last_invoice_seq FROM users WHERE id=?',[req.userId]);
    const seq = urow[0].last_invoice_seq || 1;
    const number = String(seq).padStart(4,'0');
    let subtotal=0; (items||[]).forEach(it=>{ subtotal += (Number(it.qty)||0)*(Number(it.price)||0); });
    const tax = subtotal * (Number(taxRate)||0)/100; const total=subtotal+tax;
    const payload = { clientId, items, taxRate, currency, notes };
    const r = await runAsync('INSERT INTO invoices (user_id,client_id,number,total,currency,status,payload) VALUES (?,?,?,?,?,?,?)',[req.userId,clientId,number,total,currency,'issued',JSON.stringify(payload)]);
    res.json({ok:true,id:r.lastID,number,total});
  } catch(e){ res.status(500).json({ok:false,error:e.message}); }
});
app.get('/api/invoices', requireUser, async (req,res)=>{
  try { const rows=await allAsync('SELECT id,number,total,currency,status,created_at FROM invoices WHERE user_id=? ORDER BY created_at DESC',[req.userId]); res.json({ok:true,items:rows}); } catch(e){ res.status(500).json({ok:false,error:e.message}); }
});
app.get('/api/invoices/:id', requireUser, async (req,res)=>{
  try { const rows=await allAsync('SELECT * FROM invoices WHERE id=? AND user_id=?',[req.params.id,req.userId]); if(!rows.length) return res.status(404).json({ok:false,error:'not found'}); const inv=rows[0]; let payload={}; try{ payload=JSON.parse(inv.payload);}catch{} res.json({ok:true,invoice:{ id:inv.id, number:inv.number, total:inv.total, currency:inv.currency, status:inv.status, created_at:inv.created_at, payload }}); } catch(e){ res.status(500).json({ok:false,error:e.message}); }
});
app.get('/api/invoices/:id/pdf', requireUser, async (req,res)=>{
  try {
    const rows=await allAsync('SELECT * FROM invoices WHERE id=? AND user_id=?',[req.params.id,req.userId]); if(!rows.length) return res.status(404).json({ok:false,error:'not found'});
    const inv=rows[0]; let payload={}; try{ payload=JSON.parse(inv.payload);}catch{}
    const clientRows=await allAsync('SELECT name,vat,address FROM clients WHERE id=?',[inv.client_id]); const client=clientRows[0]||{};
    const profile = await getBusinessProfile(req.userId);
    const ctx = buildTemplateContext({ profile, client:{ name: client.name, address: client.address } });
    // Merge defaults for currency / vat if missing in stored payload
    if((payload.taxRate==null || payload.taxRate==='') && ctx.defaults.vatRate!=='') payload.taxRate = ctx.defaults.vatRate;
    if(!payload.notes && ctx.defaults.noteFooter) payload.notes = ctx.defaults.noteFooter;
    if(payload.notes) payload.notes = applyTemplate(payload.notes, ctx);
    const doc=new PDFDocument(); res.setHeader('Content-disposition',`attachment; filename=fattura-${inv.number}.pdf`); res.setHeader('Content-type','application/pdf'); doc.pipe(res);
    const primary='#1e3a8a'; const light='#64748b';
    doc.fillColor(primary).fontSize(22).text('FATTURA',40,48);
    doc.fontSize(10).fillColor(light).text(`Numero: ${inv.number}`,40,78); doc.fontSize(10).fillColor(light).text(`Data: ${new Date(inv.created_at).toISOString().slice(0,10)}`,40,92);
    // Fornitore (company)
    doc.fontSize(11).fillColor(primary).text('FORNITORE',40,120);
    const companyLine = ctx.company.name + (ctx.company.piva? ` (P.IVA ${ctx.company.piva})`: '');
    doc.fontSize(10).fillColor(light).text(companyLine,40,136);
    if(ctx.company.address) doc.text(ctx.company.address,40,150);
    // Cliente
    doc.fontSize(11).fillColor(primary).text('CLIENTE',300,120); doc.fontSize(10).fillColor(light).text(client.name||'',300,136); if(client.vat) doc.text('P.IVA: '+client.vat,300,150); if(client.address) doc.text(client.address,300,164);
    const items = Array.isArray(payload.items)?payload.items:[]; const startY=210; doc.moveTo(40,startY).lineTo(555,startY).strokeColor(primary).stroke(); doc.fontSize(10).fillColor(primary).text('DESCRIZIONE',45,startY+8); doc.text('QTA',300,startY+8); doc.text('PREZZO',360,startY+8); doc.text('TOTALE',450,startY+8);
    let y=startY+26; let subtotal=0; items.forEach(it=>{ const lineTotal=(Number(it.qty)||0)*(Number(it.price)||0); subtotal+=lineTotal; doc.fillColor('#000').fontSize(10).text(it.desc||'',45,y,{width:240}); doc.text(String(it.qty||''),300,y); doc.text(formatMoney(it.price||0, inv.currency),360,y); doc.text(formatMoney(lineTotal, inv.currency),450,y); y+=18; if(y>700){ doc.addPage(); y=60; }});
    const taxRate=Number(payload.taxRate)||0; const tax=subtotal*taxRate/100; const total=subtotal+tax; doc.fontSize(10).fillColor(primary); doc.text('SUBTOTALE',360,y+10); doc.text('TASSE',360,y+26); doc.text('TOTALE',360,y+42); doc.fillColor('#000'); doc.text(formatMoney(subtotal,inv.currency),450,y+10); doc.text(formatMoney(tax,inv.currency),450,y+26); doc.text(formatMoney(total,inv.currency),450,y+42);
    if(payload.notes){ doc.addPage(); doc.fontSize(14).fillColor(primary).text('NOTE'); doc.fontSize(11).fillColor('#000').text(payload.notes,{align:'left'}); }
    doc.end();
  }catch(e){ res.status(500).json({ok:false,error:e.message}); }
});

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
