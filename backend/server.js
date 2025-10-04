/* ToolHub Backend (migrated full logic) */
const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(cookieParser());
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(helmet());

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
  app.use(express.static(FRONTEND_PUBLIC));
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
});

// Session (demo)
const sessionUsers = new Map();
function requireUser(req,res,next){
  const token = req.headers['x-session-token'];
  if(!token || !sessionUsers.has(token)) return res.status(401).json({ ok:false, error:'Not logged in' });
  req.userId = sessionUsers.get(token); next();
}

// A/B cookie assign
app.use((req,res,next)=>{ if(!req.cookies.variant){ res.cookie('variant', Math.random()<0.5?'A':'B', { httpOnly:false,sameSite:'Lax' }); } next(); });

// Rate limiters (basic IP-based)
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20, standardHeaders:true, legacyHeaders:false });
const exportLimiter = rateLimit({ windowMs: 15*60*1000, max: 50, standardHeaders:true, legacyHeaders:false });

// Helpers
function runAsync(sql,p=[]) { return new Promise((res,rej)=> db.run(sql,p,function(err){ err?rej(err):res(this); })); }
function allAsync(sql,p=[]) { return new Promise((res,rej)=> db.all(sql,p,(err,rows)=> err?rej(err):res(rows))); }

// Auth
app.post('/api/auth/register', authLimiter, async (req,res)=>{ const {email}=req.body; if(!email) return res.status(400).json({ok:false,error:'Email required'}); try{ await runAsync('INSERT OR IGNORE INTO users (email) VALUES (?)',[email]); const rows=await allAsync('SELECT id,is_pro FROM users WHERE email=?',[email]); const user=rows[0]; const token=Math.random().toString(36).slice(2); sessionUsers.set(token,user.id); res.json({ok:true,token,user}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});
app.post('/api/auth/login', authLimiter, async (req,res)=>{ const {email}=req.body; if(!email) return res.status(400).json({ok:false,error:'Email required'}); try{ const rows=await allAsync('SELECT id,is_pro FROM users WHERE email=?',[email]); if(!rows.length) return res.status(404).json({ok:false,error:'User not found'}); const token=Math.random().toString(36).slice(2); sessionUsers.set(token,rows[0].id); res.json({ok:true,token,user:rows[0]}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});
app.post('/api/pro/upgrade', requireUser, async (req,res)=>{ try{ await runAsync('UPDATE users SET is_pro=1 WHERE id=?',[req.userId]); res.json({ok:true}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});

// Limits
const BASE_LIMITS={ quoteDownloadsPerDay:3 };
async function checkBaseLimit(userId, toolKey){ if(!userId) return true; const rows=await allAsync('SELECT is_pro FROM users WHERE id=?',[userId]); if(rows.length && rows[0].is_pro) return true; if(toolKey==='quote'){ const day=await allAsync("SELECT COUNT(*) as c FROM downloads WHERE user_id=? AND tool_key='quote' AND DATE(created_at)=DATE('now')",[userId]); return day[0].c < BASE_LIMITS.quoteDownloadsPerDay; } return true; }

// Usage
app.post('/api/usage', async (req,res)=>{ const { userId=null, toolKey, action='use' } = req.body; try{ await runAsync('INSERT INTO tool_usage (user_id,tool_key,action) VALUES (?,?,?)',[userId,toolKey,action]); res.json({ok:true}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});

// ATS
app.get('/api/ats', async (req,res)=>{ const userId=req.query.userId||null; try{ let rows; if(userId){ rows=await allAsync('SELECT tool_key,COUNT(*) as cnt FROM tool_usage WHERE user_id=? GROUP BY tool_key',[userId]); } else { rows=await allAsync('SELECT tool_key,COUNT(*) as cnt FROM tool_usage GROUP BY tool_key'); } const suggestions=rows.filter(r=>r.cnt>5).map(r=>({tool:r.tool_key,reason:`Hai usato ${r.cnt} volte`})); res.json({suggestions,upsell:suggestions.length>0}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});

// Quote export
app.post('/api/export/quote', exportLimiter, async (req,res)=>{
  const payload=req.body||{}; const token=req.headers['x-session-token']; let userId=null; if(token && sessionUsers.has(token)) userId=sessionUsers.get(token);
  try{ const allowed=await checkBaseLimit(userId,'quote'); if(!allowed) return res.status(429).json({ok:false,error:'Limite giornaliero raggiunto per piano Base. Passa a Pro per download illimitati.'}); if(userId) await runAsync('INSERT INTO downloads (user_id,tool_key) VALUES (?,?)',[userId,'quote']); }catch(e){ return res.status(500).json({ok:false,error:e.message}); }
  const doc=new PDFDocument(); res.setHeader('Content-disposition','attachment; filename=quote.pdf'); res.setHeader('Content-type','application/pdf'); doc.pipe(res);
  const primary='#1e3a8a'; const light='#64748b'; const currency=payload.currency||'EUR'; const convertTo = payload.convertTo || null; const rateOverride = parseFloat(payload.rateOverride)||null;
  const STATIC_RATES={ 'EUR_USD':1.07,'USD_EUR':0.93,'EUR_GBP':0.85,'GBP_EUR':1.17 };
  function getRate(from,to){ if(!from||!to||from===to) return 1; if(rateOverride && rateOverride>0) return rateOverride; return STATIC_RATES[`${from}_${to}`]||null; }
  function money(amount,cur=currency){ try{ return new Intl.NumberFormat('it-IT',{style:'currency',currency:cur}).format(Number(amount||0)); }catch{ return (cur==='EUR'?'€':'')+Number(amount||0).toFixed(2);} }
  const logoSize=42; if(payload.logo && typeof payload.logo==='string' && payload.logo.startsWith('data:image')){ try{ doc.image(Buffer.from(payload.logo.split(',')[1],'base64'),40,40,{fit:[logoSize,logoSize]}); }catch{ doc.rect(40,40,logoSize,logoSize).fillOpacity(0.05).fill(primary).fillOpacity(1);} } else { doc.rect(40,40,logoSize,logoSize).fillOpacity(0.05).fill(primary).fillOpacity(1); }
  doc.fillColor(primary).fontSize(22).text('PREVENTIVO',100,48); const today=new Date().toISOString().slice(0,10); doc.fontSize(10).fillColor(light).text(`Data: ${today}`,100,78); doc.fontSize(10).fillColor(light).text(`Documento # ${Math.random().toString(36).slice(2,8).toUpperCase()}`,100,92);
  const companyY=120; function hr(y){ doc.strokeColor('#e2e8f0').moveTo(40,y).lineTo(555,y).stroke(); }
  doc.fontSize(11).fillColor(primary).text('FORNITORE',40,companyY); doc.fontSize(9).fillColor(light).text(payload.company?.name||'Tua Azienda Srl',40,companyY+14); doc.text(payload.company?.address||'Via Esempio 123\nCity, IT',40,companyY+28); doc.text(`P.IVA: ${payload.company?.vat||'IT00000000000'}`,40,companyY+60);
  doc.fontSize(11).fillColor(primary).text('CLIENTE',320,companyY); doc.fontSize(9).fillColor(light).text(payload.client||'Cliente',320,companyY+14); if(payload.clientAddress) doc.text(payload.clientAddress,320,companyY+28); hr(companyY+84);
  let tableTop=companyY+100; let subtotal=0; const vatRate=parseFloat(payload.vatRate)||0; const discount=parseFloat(payload.discount)||0; const items=Array.isArray(payload.lineItems)?payload.lineItems:[];
  if(items.length){ doc.fontSize(9).fillColor('#334155'); doc.text('DESCRIZIONE',40,tableTop); doc.text('QTA',330,tableTop,{width:40,align:'right'}); doc.text('PREZZO',380,tableTop,{width:70,align:'right'}); doc.text('TOTALE',470,tableTop,{width:70,align:'right'}); hr(tableTop+14); tableTop+=24; items.forEach((li,i)=>{ const qty=parseFloat(li.qty)||1; const price=parseFloat(li.price)||0; const rowTotal=qty*price; subtotal+=rowTotal; const y=tableTop+i*20; if(y>700){ doc.addPage(); tableTop=60; } doc.fontSize(9).fillColor('#0f172a').text(li.desc||'Voce',40,y,{width:260}); doc.text(qty.toString(),330,y,{width:40,align:'right'}); doc.text(money(price),380,y,{width:70,align:'right'}); doc.text(money(rowTotal),470,y,{width:70,align:'right'}); }); }
  const discountedSubtotal=Math.max(0, subtotal-discount); const vat=discountedSubtotal*(vatRate/100); const total=discountedSubtotal+vat; const boxY=Math.min(720, tableTop+items.length*20+30); doc.roundedRect(330,boxY,210,90,6).strokeColor('#cbd5e1').lineWidth(0.8).stroke(); doc.fontSize(10).fillColor('#334155'); let lineY=boxY+10; doc.text('Subtotale',340,lineY,{width:100}); doc.text(money(subtotal),430,lineY,{width:100,align:'right'}); lineY+=16; if(discount>0){ doc.text('Sconto',340,lineY,{width:100}); doc.text('-'+money(discount),430,lineY,{width:100,align:'right'}); lineY+=16; } doc.text('IVA '+vatRate.toFixed(2)+'%',340,lineY,{width:100}); doc.text(money(vat),430,lineY,{width:100,align:'right'}); lineY+=22; doc.fontSize(11).fillColor(primary).text('TOTALE',340,lineY,{width:100}); doc.fontSize(11).fillColor(primary).text(money(total),430,lineY,{width:100,align:'right'});
  if(convertTo && convertTo!==currency){ const r=getRate(currency,convertTo); if(r){ const converted= total * r; lineY+=18; doc.fontSize(9).fillColor(light).text(`Totale convertito (${convertTo}): ${money(converted,convertTo)} (tasso ${r})`,340,lineY,{width:190}); } }
  const notesY=boxY-4; doc.fontSize(9).fillColor(primary).text('Note / Termini',40,notesY); doc.fontSize(8).fillColor(light).text(payload.notes||'Pagamento a 30 giorni. Offerta valida 15 giorni salvo diversa indicazione.',40,notesY+14,{width:250}); doc.fontSize(7).fillColor('#94a3b8').text('Generato con ToolHub (demo) - Questo documento non sostituisce un documento fiscale ufficiale.',40,780,{align:'center',width:515});
  doc.end();
});

// Quote templates endpoints
app.post('/api/templates/quote', requireUser, async (req,res)=>{ const {name,payload}=req.body||{}; if(!name||!payload) return res.status(400).json({ok:false,error:'name & payload required'}); try{ const r=await runAsync('INSERT INTO quote_templates (user_id,name,payload) VALUES (?,?,?)',[req.userId,name,JSON.stringify(payload)]); res.json({ok:true,id:r.lastID}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});
app.get('/api/templates/quote', requireUser, async (req,res)=>{ try{ const rows=await allAsync('SELECT id,name,created_at FROM quote_templates WHERE user_id=? ORDER BY created_at DESC',[req.userId]); res.json({ok:true,items:rows}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});
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
app.post('/api/ab/event', async (req,res)=>{ const {event,variant}=req.body; if(!event) return res.status(400).json({ok:false,error:'event required'}); try{ await runAsync('INSERT INTO ab_events (user_id,variant,event) VALUES (?,?,?)',[null,variant||req.cookies.variant||'A',event]); res.json({ok:true}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});

// Waitlist & contact
app.post('/api/waitlist', async (req,res)=>{ const {email}=req.body; if(!email) return res.status(400).json({ok:false,error:'email required'}); try{ await runAsync('INSERT OR IGNORE INTO waitlist (email) VALUES (?)',[email]); res.json({ok:true}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});
app.post('/api/contact', async (req,res)=>{ const {email,message}=req.body; if(!email||!message) return res.status(400).json({ok:false,error:'email & message required'}); try{ await runAsync('INSERT INTO support_messages (email,message) VALUES (?,?)',[email,message]); res.json({ok:true}); }catch(e){ res.status(500).json({ok:false,error:e.message}); }});

// Dashboard route (only if static files served)
if (SERVE_STATIC) {
  app.get('/dashboard',(req,res)=> res.sendFile(path.join(FRONTEND_PUBLIC,'dashboard.html')));
}

// Health
app.get('/health',(req,res)=> res.json({ok:true,status:'up'}));

// Fallback 404
app.use((req,res)=> res.status(404).send('Not found'));

app.listen(PORT, ()=> console.log(`ToolHub backend running on http://localhost:${PORT}`));
