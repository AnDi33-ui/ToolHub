(function(){
  if(typeof window==='undefined')return;
  const { useState,useEffect } = React;
  const API_BASE = (function(){ if(window.API_BASE) return window.API_BASE.replace(/\/$/,''); if(location.port==='5173') return 'http://localhost:3000'; return ''; })();
  if(!document.cookie.match(/(^|; )variant=/)){ const v=Math.random()<0.5?'A':'B'; document.cookie='variant='+v+'; path=/'; }

  function UpgradeBanner({variant,onUpgrade}){
    return <div style={{background:variant==='A'?'#fffbeb':'#eef2ff',padding:12,borderRadius:8,marginBottom:16}}>{variant==='A'?<span><strong>Passa a Pro</strong> per download illimitati.</span>:<span><strong>Limite vicino!</strong> Aggiorna ora.</span>} <button className="btn" style={{marginLeft:8}} onClick={onUpgrade}>Upgrade</button></div>;
  }
  function ToolCard({tool,onUse,user}){
    return <div className="card tool-card">
      <div className="tool-card-head" style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',minHeight:34}}>
        <h3 style={{display:'flex',alignItems:'center',gap:6,margin:0,fontSize:'1.02rem'}}>
          <span style={{display:'inline-block',flex:1}}>{tool.title}</span>
        </h3>
        <div><span className={'badge '+(tool.pro?'pro':'base')}>{tool.pro?'Pro':'Base'}</span></div>
      </div>
      <div className="tool-card-body" style={{display:'flex',flexDirection:'column',flex:1}}>
        <p style={{flexGrow:0}}>{tool.description}</p>
        <div style={{flexGrow:1}} />
        <div className="tool-card-actions" style={{display:'flex',flexDirection:'column',gap:8,marginTop:4}}>
          <button className="btn" onClick={()=>onUse(tool.key)}>Usa ora</button>
          <button className="btn secondary" onClick={()=>alert('Condividi: implementare social share')}>Condividi</button>
        </div>
      </div>
    </div>; }

  function App(){
    const [tools] = useState([
      { key:'pdfjpg',title:'Convertitore PDF ↔ JPG',description:'Converti file PDF in immagini JPG e viceversa.',pro:false },
      { key:'bmi',title:'Calcolatore IMC',description:'Calcola indice di massa corporea.',pro:false },
      { key:'quote',title:'Generatore preventivi PDF',description:'Crea preventivi professionali e scaricali.',pro:true },
      { key:'flashcard',title:'Flashcard generator',description:'Genera mazzi e PDF per studio.',pro:false },
      { key:'taxes',title:'Calcolatore tasse freelance',description:'Stima tasse e ritenute.',pro:true }
    ]);
    const [token,setToken]=useState(null); const [user,setUser]=useState(null); const [variant,setVariant]=useState('A'); const [showUpgrade,setShowUpgrade]=useState(false); const [ats,setAts]=useState([]);
    const [quota,setQuota]=useState(null); // {limits:{},usage:{}}

    // Variant + ATS polling
    useEffect(()=>{ const m=document.cookie.match(/variant=([^;]+)/); if(m) setVariant(m[1]); const int=setInterval(()=>{ fetch(API_BASE+'/api/ats').then(r=>r.json()).then(d=>{ setAts(d.suggestions||[]); if(d.upsell) setShowUpgrade(true); }); },5000); return ()=>clearInterval(int); },[]);
    // Restore token & load user
    useEffect(()=>{ try{ const t=localStorage.getItem('sessionToken'); if(t){ setToken(t); fetchMe(t); fetchQuota(t); } }catch(_){} },[]);
    useEffect(()=>{ if(showUpgrade){ fetch(API_BASE+'/api/ab/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'banner_view',variant})}); } },[showUpgrade,variant]);

    async function fetchMe(t){ try{ const r=await fetch(API_BASE+'/api/auth/me',{headers:{'x-session-token':t}}); const j=await r.json(); if(j.ok) setUser(j.user); }catch(_){ } }
    async function fetchQuota(t){ try{ const r=await fetch(API_BASE+'/api/usage/summary',{headers:{'x-session-token':t}}); const j=await r.json(); if(j.ok) setQuota(j); }catch(_){ } }

    async function authQuick(promptMsg, path){ const email=window.prompt(promptMsg); if(!email) return; const r=await fetch(API_BASE+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})}); const j=await r.json(); if(j.ok){ setToken(j.token); localStorage.setItem('sessionToken',j.token); setUser(j.user); fetchQuota(j.token); } }
    const register=()=>authQuick('Email per registrazione:','/api/auth/register');
    const login=()=>authQuick('Email per login:','/api/auth/login');
    function logout(){ setToken(null); setUser(null); setQuota(null); try{ localStorage.removeItem('sessionToken'); }catch(_){} }
    async function upgrade(){ if(!token){ alert('Prima login'); return; } fetch(API_BASE+'/api/ab/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'upgrade_click',variant})}); const r=await fetch(API_BASE+'/api/pro/upgrade',{method:'POST',headers:{'x-session-token':token}}); const j=await r.json(); if(j.ok){ alert('Sei Pro!'); setUser({...user,is_pro:1}); setShowUpgrade(false); fetchQuota(token); } }
    function handleUse(key){ fetch(API_BASE+'/api/usage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({toolKey:key})}); if(key==='quote'){ fetchQuota(token); } window.open(`/tool.html?tool=${key}`,'_blank','noopener'); }

    const quotaInfo = (quota && (!user || !user.is_pro)) ? (
      <div style={{fontSize:11,background:'var(--bg-alt)',padding:'6px 10px',border:'1px solid var(--border)',borderRadius:8,marginBottom:14}}>
        Download preventivi oggi: {quota.usage.quoteDownloadsToday}/{quota.limits.quoteDownloadsPerDay} {quota.usage.quoteDownloadsToday>=quota.limits.quoteDownloadsPerDay? ' (Limite raggiunto)': ''}
      </div>
    ) : null;

    return <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:30}}>
        <div>
          <h2 style={{margin:'0 0 6px'}}>Catalogo Strumenti</h2>
          <p style={{margin:0,color:'var(--text-light)',fontSize:'.8rem'}}>Scegli e apri in nuova scheda. <a href="/" style={{fontSize:'.75rem'}}>← Torna alla Home</a></p>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          {!user && <button className="btn" onClick={register}>Registrati</button>}
          {!user && <button className="btn secondary" onClick={login}>Login</button>}
          {user && <span style={{fontSize:12}}> {user.email} {user.is_pro? '(Pro)':''}</span>}
          {user && <button className="btn outline" onClick={logout}>Logout</button>}
        </div>
      </div>
      {quotaInfo}
      {showUpgrade && <UpgradeBanner variant={variant} onUpgrade={upgrade} />}
      <section className="grid">
        {tools.map(t=> <ToolCard key={t.key} tool={t} onUse={handleUse} user={user} />)}
      </section>
      {ats.length>0 && <div style={{marginTop:24,fontSize:12,color:'#6b7280'}}>Suggerimenti: {ats.map(a=>a.tool+':'+a.reason).join(', ')}</div>}
    </div>;
  }

  const mount=document.getElementById('tools-root');
  if(mount){ ReactDOM.render(React.createElement(App), mount); requestAnimationFrame(()=>{ document.body.classList.remove('preload'); document.body.classList.add('app-ready'); }); }

  // Theme toggle reuse
  const yearEl=document.getElementById('year'); if(yearEl) yearEl.textContent=new Date().getFullYear();
  const themeBtn=document.getElementById('themeToggle'); if(themeBtn){ themeBtn.addEventListener('click',()=>{ document.body.classList.toggle('dark'); localStorage.setItem('theme',document.body.classList.contains('dark')?'dark':'light'); }); if(localStorage.getItem('theme')==='dark') document.body.classList.add('dark'); }
})();
