(function(){
  if(typeof window==='undefined')return;
  const API_BASE = window.API_BASE || '';
  const qs = sel=>document.querySelector(sel);
  const backdrop = qs('#auth-backdrop');
  const form = qs('#auth-form');
  const emailInput = qs('#auth-email');
  const statusEl = qs('#auth-status');
  const modeNote = qs('#auth-mode-note');
  const navAuth = qs('#nav-auth');
  let mode = 'register';
  let token = null; let user = null;

  function loadSession(){ try{ const t=localStorage.getItem('sessionToken'); if(t){ token=t; fetch(API_BASE+'/api/ats').catch(()=>{}); // ping
    // Pseudo: we don't have a user fetch endpoint; store minimal state
    renderNav(); } }catch(_){} }

  function openAuth(m){ mode=m; statusEl.textContent=''; form.reset(); backdrop.classList.remove('hidden'); emailInput.focus(); modeNote.textContent = mode==='login' ? 'Accesso esistente.' : 'Registrazione nuova.'; }
  function closeAuth(){ backdrop.classList.add('hidden'); }

  function renderNav(){
    if(!navAuth) return;
    if(!token){ navAuth.innerHTML = '<button class="btn secondary" id="nav-login">Login</button><button class="btn" id="nav-register">Registrati</button>'; }
    else { navAuth.innerHTML = '<button class="btn outline" id="nav-tools" onclick="location.href=\'/tools.html\'">Strumenti</button><button class="btn secondary" id="nav-logout">Logout</button>'; }
    attachNavEvents();
  }

  function attachNavEvents(){
    const l=qs('#nav-login'); if(l) l.addEventListener('click',()=>openAuth('login'));
    const r=qs('#nav-register'); if(r) r.addEventListener('click',()=>openAuth('register'));
    const lo=qs('#nav-logout'); if(lo) lo.addEventListener('click',()=>{ token=null; user=null; try{localStorage.removeItem('sessionToken');}catch(_){} renderNav(); });
  }

  form?.addEventListener('submit', async e=>{
    e.preventDefault();
    const email = emailInput.value.trim(); if(!email) return;
    statusEl.textContent = (mode==='login'? 'Login...' : 'Registrazione...');
    try{
      const url = API_BASE + (mode==='login'? '/api/auth/login':'/api/auth/register');
      const r = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
      const j = await r.json();
      if(!j.ok){ statusEl.textContent = 'Errore: '+j.error; return; }
      token = j.token; user = j.user; try{ localStorage.setItem('sessionToken', token); }catch(_){ }
      statusEl.textContent = 'Successo!';
      setTimeout(()=>{ closeAuth(); renderNav(); },450);
    }catch(err){ statusEl.textContent = 'Errore rete: '+err.message; }
  });
  qs('#auth-cancel')?.addEventListener('click', closeAuth);
  qs('#open-login')?.addEventListener('click',()=>openAuth('login'));
  qs('#open-register')?.addEventListener('click',()=>openAuth('register'));
  qs('#pricing-login')?.addEventListener('click',()=>openAuth('login'));
  qs('#pricing-register')?.addEventListener('click',()=>openAuth('register'));

  // Click outside modal to close
  backdrop?.addEventListener('click', e=>{ if(e.target===backdrop) closeAuth(); });

  // Contact form handling (reuse from previous script)
  const cform = document.getElementById('contact-form');
  if(cform){
    cform.addEventListener('submit', async e=>{
      e.preventDefault();
      const fd=new FormData(cform); const payload={ email:fd.get('email'), message:fd.get('message') };
      const status=document.getElementById('contact-status'); status.textContent='Invio...';
      try{ const r=await fetch(API_BASE+'/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); const j=await r.json(); status.textContent=j.ok? 'Messaggio inviato ✅':'Errore: '+j.error; }catch(err){ status.textContent='Errore rete: '+err.message; }
    });
    document.getElementById('join-waitlist')?.addEventListener('click', async ()=>{
      const email=cform.querySelector('input[name=email]').value; if(!email){ alert('Inserisci email'); return; }
      const status=document.getElementById('contact-status'); status.textContent='Iscrizione...';
      try{ const r=await fetch(API_BASE+'/api/waitlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})}); const j=await r.json(); status.textContent=j.ok? 'Sei in waitlist 🎉':'Errore: '+j.error; }catch(err){ status.textContent='Errore rete: '+err.message; }
    });
  }

  // Theme toggle (reuse pattern)
  const themeBtn=document.getElementById('themeToggle');
  if(themeBtn){
    themeBtn.addEventListener('click',()=>{ document.body.classList.toggle('dark'); localStorage.setItem('theme',document.body.classList.contains('dark')?'dark':'light'); });
    if(localStorage.getItem('theme')==='dark') document.body.classList.add('dark');
  }

  // Year
  const yearEl=document.getElementById('year'); if(yearEl) yearEl.textContent=new Date().getFullYear();

  // Mark ready
  requestAnimationFrame(()=>{ document.body.classList.remove('preload'); document.body.classList.add('app-ready'); });
  loadSession(); renderNav();
})();
