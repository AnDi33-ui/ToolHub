// Landing page logic (bundled)
(function(){
  if(typeof window==='undefined')return;
  const API_BASE = window.API_BASE || '';
  const qs = sel=>document.querySelector(sel);
  const backdrop = qs('#auth-backdrop');
  const form = qs('#auth-form');
  const emailInput = qs('#auth-email');
  const nameInput = qs('#auth-name');
  const passInput = qs('#auth-password');
  const pass2Input = qs('#auth-password2');
  const marketingChk = qs('#auth-marketing');
  const statusEl = qs('#auth-status');
  const modeNote = qs('#auth-mode-note');
  const toggleBtn = qs('#auth-toggle');
  const forgotLink = qs('#auth-forgot');
  const navAuth = qs('#nav-auth');
  // modes: register | login | request-reset | reset
  let mode = 'register';
  let user = null; // server uses cookie session now
  function loadSession(){ // just call /me, cookie-based
    fetch(API_BASE+'/api/auth/me',{credentials:'include'}).then(r=>r.json()).then(j=>{ if(j.ok){ user=j.user; } renderNav(); }).catch(()=>{});
  }
  function setMode(m){ mode=m; statusEl.textContent=''; form?.reset(); if(nameInput) nameInput.style.display = (mode==='register')? 'block':'none'; if(pass2Input) pass2Input.style.display = (mode==='register')? 'block':'none'; if(marketingChk) marketingChk.parentElement.style.display = (mode==='register')? 'flex':'none'; if(toggleBtn) toggleBtn.textContent = (mode==='login')? 'Crea un nuovo account' : (mode==='register'? 'Hai già un account?' : 'Torna al login'); if(forgotLink) forgotLink.style.display = (mode==='login')? 'inline':'none'; modeNote.textContent = (mode==='login')? 'Accesso esistente.' : (mode==='register'? 'Registrazione nuova.' : (mode==='request-reset'? 'Richiedi link reset.' : 'Imposta nuova password.')); }
  function openAuth(m){ setMode(m); backdrop.classList.remove('hidden'); emailInput.focus(); }
  function closeAuth(){ backdrop.classList.add('hidden'); }
  function renderNav(){ if(!navAuth) return; if(!user){ navAuth.innerHTML = '<button class="btn secondary" id="nav-login">Login</button><button class="btn" id="nav-register">Registrati</button>'; } else { navAuth.innerHTML = '<span style="font-size:.65rem;color:var(--text-light);margin-right:6px;">'+(user.name?user.name:user.email)+'</span><button class="btn outline" id="nav-tools" onclick="location.href=\'/tools.html\'">Strumenti</button><button class="btn secondary" id="nav-logout">Logout</button>'; } attachNavEvents(); }
  function syncBodyAuthClass(){ if(typeof document!=='undefined'){ if(user){ document.body.classList.add('auth-logged'); } else { document.body.classList.remove('auth-logged'); } } }
  function updateLandingButtons(){
    const show = !user;
    ['#open-login','#open-register','#pricing-login','#pricing-register'].forEach(sel=>{ const el=qs(sel); if(el){ el.style.display = show ? '' : 'none'; }});
    syncBodyAuthClass();
  }
  function attachNavEvents(){ const l=qs('#nav-login'); if(l) l.addEventListener('click',()=>openAuth('login')); const r=qs('#nav-register'); if(r) r.addEventListener('click',()=>openAuth('register')); const lo=qs('#nav-logout'); if(lo) lo.addEventListener('click', async ()=>{ await fetch(API_BASE+'/api/auth/logout',{method:'POST',credentials:'include'}); user=null; renderNav(); }); }
  toggleBtn?.addEventListener('click', e=>{ e.preventDefault(); if(mode==='login') setMode('register'); else if(mode==='register') setMode('login'); else setMode('login'); });
  forgotLink?.addEventListener('click', e=>{ e.preventDefault(); setMode('request-reset'); });
  form?.addEventListener('submit', async e=>{ e.preventDefault(); statusEl.textContent=''; const email=emailInput.value.trim(); if(!email){ statusEl.textContent='Email richiesta'; return; }
    if(mode==='register'){
      const pw=passInput.value, pw2=pass2Input.value; if(pw!==pw2){ statusEl.textContent='Password non coincidono'; return; }
      statusEl.textContent='Registrazione...';
  try{ const r=await fetch(API_BASE+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({email,password:pw,name:nameInput.value.trim(),marketingOptIn:marketingChk.checked})}); const j=await r.json(); if(!j.ok){ statusEl.textContent='Errore: '+j.error; return; } user=j.user; statusEl.textContent='Successo!'; setTimeout(()=>{ closeAuth(); renderNav(); updateLandingButtons(); },500);}catch(err){ statusEl.textContent='Errore: '+err.message; }
    } else if(mode==='login'){
  const pw=passInput.value; statusEl.textContent='Login...'; try{ const r=await fetch(API_BASE+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({email,password:pw})}); const j=await r.json(); if(!j.ok){ statusEl.textContent='Errore: '+j.error; return; } user=j.user; statusEl.textContent='Benvenuto'; setTimeout(()=>{ closeAuth(); renderNav(); updateLandingButtons(); },400);}catch(err){ statusEl.textContent='Errore: '+err.message; }
    } else if(mode==='request-reset'){
      statusEl.textContent='Invio...'; try{ const r=await fetch(API_BASE+'/api/auth/request-reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})}); const j=await r.json(); if(j.ok){ statusEl.textContent='Email (debug token in response) inviata'; if(j.token){ statusEl.textContent+=' Token: '+j.token; } setMode('reset'); } else { statusEl.textContent='Errore: '+j.error; } }catch(err){ statusEl.textContent='Errore: '+err.message; }
    } else if(mode==='reset'){
      const pw=passInput.value, pw2=pass2Input.value; if(pw!==pw2){ statusEl.textContent='Password non coincidono'; return; }
      const tokenPrompt = window.prompt('Inserisci token reset (debug):'); if(!tokenPrompt){ statusEl.textContent='Token mancante'; return; }
      statusEl.textContent='Reset...'; try{ const r=await fetch(API_BASE+'/api/auth/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:tokenPrompt,password:pw})}); const j=await r.json(); if(!j.ok){ statusEl.textContent='Errore: '+j.error; return; } statusEl.textContent='Password aggiornata. Ora login.'; setTimeout(()=>{ setMode('login'); },600);}catch(err){ statusEl.textContent='Errore: '+err.message; }
    }
  });
  qs('#auth-cancel')?.addEventListener('click', closeAuth);
  qs('#open-login')?.addEventListener('click',()=>openAuth('login'));
  qs('#open-register')?.addEventListener('click',()=>openAuth('register'));
  qs('#pricing-login')?.addEventListener('click',()=>openAuth('login'));
  qs('#pricing-register')?.addEventListener('click',()=>openAuth('register'));
  const cform = document.getElementById('contact-form');
  if(cform){ cform.addEventListener('submit', async e=>{ e.preventDefault(); const fd=new FormData(cform); const payload={ email:fd.get('email'), message:fd.get('message') }; const status=document.getElementById('contact-status'); status.textContent='Invio...'; try{ const r=await fetch(API_BASE+'/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); const j=await r.json(); status.textContent=j.ok? 'Messaggio inviato ✅':'Errore: '+j.error; }catch(err){ status.textContent='Errore rete: '+err.message; } }); document.getElementById('join-waitlist')?.addEventListener('click', async ()=>{ const email=cform.querySelector('input[name=email]').value; if(!email){ alert('Inserisci email'); return; } const status=document.getElementById('contact-status'); status.textContent='Iscrizione...'; try{ const r=await fetch(API_BASE+'/api/waitlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})}); const j=await r.json(); status.textContent=j.ok? 'Sei in waitlist 🎉':'Errore: '+j.error; }catch(err){ status.textContent='Errore rete: '+err.message; } }); }
  const themeBtn=document.getElementById('themeToggle'); if(themeBtn){ themeBtn.addEventListener('click',()=>{ document.body.classList.toggle('dark'); localStorage.setItem('theme',document.body.classList.contains('dark')?'dark':'light'); }); if(localStorage.getItem('theme')==='dark') document.body.classList.add('dark'); }
  const yearEl=document.getElementById('year'); if(yearEl) yearEl.textContent=new Date().getFullYear();
  requestAnimationFrame(()=>{ document.body.classList.remove('preload'); document.body.classList.add('app-ready'); });
  setMode('register');
  loadSession();
  renderNav();
  updateLandingButtons();
  syncBodyAuthClass();
})();
