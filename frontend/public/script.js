/* Migrated main script.js from legacy public */
/* Main React app - mounts the grid and loads tool components
  Using in-browser Babel for rapid demo. For production use a build step.
  NOTE: Wrapped in IIFE + window check so if Node tries to load this file (e.g. mistaken require)
  it will short‑circuit before hitting JSX (preventing SyntaxError in tooling).
*/
(function(){
  if (typeof window === 'undefined' || typeof document === 'undefined') return; // guard for Node
  const { useState, useEffect } = React; // ensure declared only once

// Detect API base: when running via standalone frontend (port 5173) assume backend on 3000
const API_BASE = (function(){
  if(window.API_BASE) return window.API_BASE.replace(/\/$/,'');
  if(location.port === '5173') return 'http://localhost:3000';
  return ''; // same origin
})();

// Ensure A/B variant cookie exists even if backend non ha ancora impostato Set-Cookie (se domini separati)
if(!document.cookie.match(/(^|; )variant=/)){
  const v = Math.random() < 0.5 ? 'A':'B';
  document.cookie = 'variant='+v+'; path=/';
}

function UpgradeBanner({variant, onUpgrade}){
  return (
    <div style={{background: variant==='A'? '#fffbeb':'#eef2ff', padding:12, borderRadius:8, marginBottom:16}}>
      {variant==='A' ? (
        <span><strong>Passa a Pro</strong> per download illimitati e funzioni avanzate. </span>
      ) : (
        <span><strong>Sei vicino al limite!</strong> Sblocca ToolHub Pro ora. </span>
      )}
      <button className="btn" style={{marginLeft:8}} onClick={onUpgrade}>Upgrade</button>
    </div>
  );
}

function ToolCard({ tool, onUse }){
  return (
    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h3>{tool.title}</h3>
        <div>
          <span className={"badge "+(tool.pro? 'pro':'base')}>{tool.pro? 'Pro':'Base'}</span>
        </div>
      </div>
      <p>{tool.description}</p>
      <div className="row">
        <div>
          <button className="btn" onClick={()=>onUse(tool.key)}>Usa ora</button>
        </div>
        <div>
          <button className="btn secondary" onClick={()=>alert('Condividi: implementare social share')}>Condividi</button>
        </div>
      </div>
    </div>
  );
}

function App(){
  const [activeTool, setActiveTool] = useState(null);
  const [tools] = useState([
    { key: 'pdfjpg', title: 'Convertitore PDF ↔ JPG', description: 'Converti file PDF in immagini JPG e viceversa.', pro: false },
    { key: 'bmi', title: 'Calcolatore IMC', description: 'Calcola l\'indice di massa corporea (IMC/BMI).', pro: false },
    { key: 'quote', title: 'Generatore di preventivi PDF', description: 'Crea preventivi professionali e scaricali in PDF.', pro: true },
    { key: 'flashcard', title: 'Flashcard generator', description: 'Genera flashcard da JSON e scarica come PDF.', pro: false },
    { key: 'taxes', title: 'Calcolatore tasse freelance', description: 'Stima tasse e ritenute per freelance.', pro: true }
  ]);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [variant, setVariant] = useState('A');
  const [ats, setAts] = useState([]);
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(()=>{
    const m = document.cookie.match(/variant=([^;]+)/); if(m) setVariant(m[1]);
    const id = setInterval(()=>{
      fetch(API_BASE + '/api/ats')
        .then(r=>r.json())
        .then(data=>{
        setAts(data.suggestions||[]);
        if(data.upsell) setShowUpgrade(true);
      });
    },5000);
    return ()=>clearInterval(id);
  },[]);

  async function register(){
    const email = prompt('Email per registrazione:');
    if(!email) return;
  const r = await fetch(API_BASE + '/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
    const j = await r.json(); if(j.ok){ setToken(j.token); setUser(j.user); }
  }
  async function login(){
    const email = prompt('Email per login:');
    if(!email) return;
  const r = await fetch(API_BASE + '/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
    const j = await r.json(); if(j.ok){ setToken(j.token); setUser(j.user); }
  }
  async function upgrade(){
    if(!token){ alert('Prima registrati/login'); return; }
  fetch(API_BASE + '/api/ab/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'upgrade_click',variant})});
  const r = await fetch(API_BASE + '/api/pro/upgrade',{method:'POST',headers:{'x-session-token':token}});
    const j = await r.json(); if(j.ok){ alert('Sei Pro!'); setUser({...user,is_pro:1}); setShowUpgrade(false); }
  }

  function handleUse(key){
  fetch(API_BASE + '/api/usage', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ toolKey:key }) });
    window.open(`/tool.html?tool=${key}`,'_blank','noopener');
  }

  useEffect(()=>{
    if(showUpgrade){
  fetch(API_BASE + '/api/ab/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'banner_view',variant})});
    }
  },[showUpgrade,variant]);

  return (
    <div>
      {showUpgrade && <UpgradeBanner variant={variant} onUpgrade={upgrade} />}
      <section className="hero">
        <h1>ToolHub</h1>
        <p>Raccolta di strumenti utili per studenti, freelance e PMI. Freemium con funzioni Pro.</p>
        <div style={{display:'flex',gap:8}}>
          {!user && <button className="btn" onClick={register}>Registrati</button>}
          {!user && <button className="btn secondary" onClick={login}>Login</button>}
          {user && <span style={{fontSize:12}}>Loggato come {user.email} {user.is_pro? '(Pro)':''}</span>}
        </div>
      </section>
      <section id="tools" className="grid">
        {tools.map(t=> (<ToolCard key={t.key} tool={t} onUse={handleUse} />))}
      </section>
      {ats.length>0 && <div style={{marginTop:24,fontSize:12,color:'#6b7280'}}>Suggerimenti: {ats.map(a=>a.tool+':'+a.reason).join(', ')}</div>}
    </div>
  );
}

  ReactDOM.render(React.createElement(App), document.getElementById('root'));
  // Anti-flicker: mark app ready next frame
  requestAnimationFrame(()=>{
    document.body.classList.remove('preload');
    document.body.classList.add('app-ready');
  });

// Year placeholder (only if element exists in page)
const yearEl = document.getElementById('year');
if(yearEl) yearEl.textContent = new Date().getFullYear();

const themeBtn = document.getElementById('themeToggle');
if(themeBtn){
  themeBtn.addEventListener('click', ()=>{
    document.body.classList.toggle('dark');
    localStorage.setItem('theme', document.body.classList.contains('dark')? 'dark':'light');
  });
  if(localStorage.getItem('theme')==='dark') document.body.classList.add('dark');
}

const cform = document.getElementById('contact-form');
if(cform){
  cform.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const fd = new FormData(cform);
    const payload = { email: fd.get('email'), message: fd.get('message') };
    const status = document.getElementById('contact-status');
    status.textContent = 'Invio...';
    try{
  const r = await fetch(API_BASE + '/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const j = await r.json();
      status.textContent = j.ok? 'Messaggio inviato ✅':'Errore: '+j.error;
    }catch(err){ status.textContent = 'Errore rete: '+err.message; }
  });
  document.getElementById('join-waitlist').addEventListener('click', async ()=>{
    const email = cform.querySelector('input[name=email]').value;
    if(!email){ alert('Inserisci email'); return; }
    const status = document.getElementById('contact-status');
    status.textContent = 'Iscrizione...';
    try{
  const r = await fetch(API_BASE + '/api/waitlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
      const j = await r.json();
      status.textContent = j.ok? 'Sei in waitlist 🎉':'Errore: '+j.error;
    }catch(err){ status.textContent='Errore rete: '+err.message; }
  });
}

function share(net){
  const url = location.href;
  const text = encodeURIComponent('Scopri ToolHub: strumenti utili per studenti, freelance e PMI');
  const shareMap = {
    twitter:`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url)}`,
    linkedin:`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    facebook:`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`
  };
  if(navigator.share){
    navigator.share({ title:'ToolHub', text:'Toolkit utile', url }).catch(()=> window.open(shareMap[net]||url,'_blank'));
  } else {
    window.open(shareMap[net]||url,'_blank');
  }
}
  document.querySelectorAll('.share-link').forEach(a=>{
    a.addEventListener('click', e=>{ e.preventDefault(); share(a.dataset.net); });
  });
})();
