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
  const resetTokenInput = qs('#auth-reset-token');
  const marketingChk = qs('#auth-marketing');
  const statusEl = qs('#auth-status');
  const modeNote = qs('#auth-mode-note');
  const toggleBtn = qs('#auth-toggle');
  const forgotLink = qs('#auth-forgot');
  const navAuth = qs('#nav-auth');
  // Profile panel elements
  const profilePanel = qs('#profile-panel');
  const profileEmail = qs('#profile-email');
  const profileName = qs('#profile-name');
  const profileMarketing = qs('#profile-marketing');
  const profilePlan = qs('#profile-plan');
  const profileStatus = qs('#profile-status');
  const profileSaveBtn = qs('#profile-save');
  const profileLogoutBtn = qs('#profile-logout');
  const profileCloseBtn = qs('#profile-close');
  const cpOld = qs('#cp-old');
  const cpNew = qs('#cp-new');
  const cpNew2 = qs('#cp-new2');
  const cpSubmit = qs('#cp-submit');
  const cpStatus = qs('#cp-status');
  // modes: register | login | request-reset | reset
  let mode = 'register';
  let user = null; // server uses cookie session now
  function loadSession(){ // just call /me, cookie-based
    fetch(API_BASE+'/api/auth/me',{credentials:'include'})
      .then(r=>r.json())
      .then(j=>{ if(j.ok){ user=j.user; } renderNav(); updateLandingButtons(); })
      .catch(()=>{});
  }
  function setMode(m){
    const prevMode = mode;
    mode=m;
    statusEl.textContent='';
    // Do not nuke form (we want to keep email on request-reset)
    if(m==='register'){
      // Only clear password fields if entering register fresh
      passInput.value=''; pass2Input.value=''; if(resetTokenInput) resetTokenInput.value='';
    }
    // Visibility
    if(nameInput) nameInput.style.display = (mode==='register')? 'block':'none';
    if(passInput){
      if(mode==='request-reset'){ passInput.style.display='none'; passInput.removeAttribute('required'); }
      else { passInput.style.display='block'; passInput.setAttribute('required','required'); }
    }
    if(pass2Input){
      if(mode==='register' || mode==='reset') { pass2Input.style.display='block'; }
      else { pass2Input.style.display='none'; }
    }
    if(marketingChk) marketingChk.parentElement.style.display = (mode==='register')? 'flex':'none';
    if(resetTokenInput) resetTokenInput.style.display = (mode==='reset')? 'block':'none';
    // Placeholders context
    if(passInput){
      if(mode==='register') passInput.placeholder='Password';
      else if(mode==='login') passInput.placeholder='Password';
      else if(mode==='reset') passInput.placeholder='Nuova password';
    }
    if(pass2Input){
      if(mode==='reset') pass2Input.placeholder='Ripeti nuova password';
      else if(mode==='register') pass2Input.placeholder='Ripeti Password';
    }
    if(toggleBtn) toggleBtn.textContent = (mode==='login')? 'Crea un nuovo account' : (mode==='register'? 'Hai già un account?' : 'Torna al login');
    if(forgotLink) forgotLink.style.display = (mode==='login')? 'inline':'none';
    modeNote.textContent = (mode==='login')? 'Accesso esistente.' : (mode==='register'? 'Registrazione nuova.' : (mode==='request-reset'? 'Richiedi link reset.' : 'Imposta nuova password.'));
    // When moving automatically to reset (after request-reset), preserve existing email value
    if(prevMode==='request-reset' && mode==='reset'){
      // nothing to do explicitly, just don't clear fields
    }
  }
  function openAuth(m){ setMode(m); backdrop.classList.remove('hidden'); emailInput.focus(); }
  function closeAuth(){ backdrop.classList.add('hidden'); }
  function renderNav(){
    if(!navAuth) return;
    if(!user){
      navAuth.innerHTML = '<button class="btn secondary" id="nav-login">Login</button><button class="btn" id="nav-register">Registrati</button>';
    } else {
      const initial = (user.name||user.email||'?').trim()[0].toUpperCase();
      navAuth.innerHTML = '<button class="avatar-btn" id="nav-profile-btn" aria-label="Profilo" style="width:34px;height:34px;border-radius:50%;background:var(--accent-gradient);color:#fff;font-weight:600;font-size:.8rem;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;margin-right:6px;">'+initial+'</button>'+
        '<button class="btn outline" id="nav-tools" onclick="location.href=\'/tools.html\'">Strumenti</button>'+
        '<button class="btn secondary" id="nav-logout">Logout</button>';
    }
    attachNavEvents();
  }
  function syncBodyAuthClass(){ if(typeof document!=='undefined'){ if(user){ document.body.classList.add('auth-logged'); } else { document.body.classList.remove('auth-logged'); } } }
  function updateLandingButtons(){
    const show = !user;
    ['#open-login','#open-register','#pricing-login','#pricing-register'].forEach(sel=>{ const el=qs(sel); if(el){ el.style.display = show ? '' : 'none'; }});
    syncBodyAuthClass();
  }
  function attachNavEvents(){
    const l=qs('#nav-login'); if(l) l.addEventListener('click',()=>openAuth('login'));
    const r=qs('#nav-register'); if(r) r.addEventListener('click',()=>openAuth('register'));
    const lo=qs('#nav-logout'); if(lo) lo.addEventListener('click', async ()=>{ await fetch(API_BASE+'/api/auth/logout',{method:'POST',credentials:'include'}); user=null; renderNav(); hideProfilePanel(); updateLandingButtons(); });
    const pbtn=qs('#nav-profile-btn'); if(pbtn) pbtn.addEventListener('click',()=>{ if(profilePanel.classList.contains('hidden')){ openProfilePanel(); } else { hideProfilePanel(); } });
  }

  function openProfilePanel(){ if(!user) return; populateProfile(); profilePanel.classList.remove('hidden'); }
  function hideProfilePanel(){ profilePanel?.classList.add('hidden'); }
  profileCloseBtn?.addEventListener('click', hideProfilePanel);

  function populateProfile(){ if(!user) return; if(profileEmail) profileEmail.value = user.email||''; if(profileName) profileName.value = user.name||''; if(profileMarketing) profileMarketing.checked = !!user.marketingOptIn; if(profilePlan) profilePlan.textContent = 'Piano: ' + (user.plan || 'base').toUpperCase(); }

  profileSaveBtn?.addEventListener('click', async ()=>{
    if(!user) return;
    profileStatus.textContent='Salvataggio...';
    try {
      const r = await fetch(API_BASE+'/api/profile/update',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({ name:profileName.value.trim(), marketingOptIn:profileMarketing.checked })});
      const j = await r.json();
      if(!j.ok){ profileStatus.textContent='Errore: '+(j.error||j.code); return; }
      user=j.user; profileStatus.textContent='Aggiornato ✅'; populateProfile(); renderNav();
      setTimeout(()=>{ profileStatus.textContent=''; },1600);
    } catch(err){ profileStatus.textContent='Errore rete: '+err.message; }
  });

  cpSubmit?.addEventListener('click', async ()=>{
    cpStatus.textContent='Aggiornamento...';
    const oldp=cpOld.value, np=cpNew.value, np2=cpNew2.value;
    if(!oldp||!np){ cpStatus.textContent='Compila i campi'; return; }
    if(np!==np2){ cpStatus.textContent='Nuove password non coincidono'; return; }
    try{
      const r=await fetch(API_BASE+'/api/auth/change-password',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:oldp,newPassword:np})});
      const j=await r.json();
      if(!j.ok){
        const map={INVALID_CREDENTIALS:'Password attuale errata', WEAK_PASSWORD:'Password troppo debole'};
        cpStatus.textContent='Errore: '+(map[j.code]||j.error||j.code||'');
        return;
      }
      cpStatus.textContent='Password aggiornata ✅';
      cpOld.value=cpNew.value=cpNew2.value='';
      setTimeout(()=>{ cpStatus.textContent=''; },1600);
    }catch(err){ cpStatus.textContent='Errore: '+err.message; }
  });

  profileLogoutBtn?.addEventListener('click', async ()=>{
    await fetch(API_BASE+'/api/auth/logout',{method:'POST',credentials:'include'});
    user=null; hideProfilePanel(); renderNav(); updateLandingButtons();
  });
  toggleBtn?.addEventListener('click', e=>{ e.preventDefault(); if(mode==='login') setMode('register'); else if(mode==='register') setMode('login'); else setMode('login'); });
  forgotLink?.addEventListener('click', e=>{ e.preventDefault(); setMode('request-reset'); });
  form?.addEventListener('submit', async e=>{ e.preventDefault(); statusEl.textContent=''; const email=emailInput.value.trim(); if(!email){ statusEl.textContent='Email richiesta'; return; }
    const normEmail = email.toLowerCase();
    function showError(j){
      const map={
        EMAIL_EXISTS:'Email già registrata',
        WEAK_PASSWORD:'Password troppo debole (min 8, lettere e numeri)',
        INVALID_CREDENTIALS:'Credenziali non valide',
        INVALID_EMAIL:'Formato email non valido',
        LEGACY_ACCOUNT:'Account da aggiornare, reset password',
        SERVER_ERROR:'Errore interno, riprova',
        INVALID_TOKEN:'Token non valido',
        TOKEN_USED:'Token già usato',
        TOKEN_EXPIRED:'Token scaduto'
      };
      statusEl.textContent = 'Errore: ' + (map[j.code] || j.error || 'Problema sconosciuto');
    }
  if(mode==='register'){
      const pw=passInput.value, pw2=pass2Input.value; if(pw!==pw2){ statusEl.textContent='Password non coincidono'; return; }
      statusEl.textContent='Registrazione...';
      try{ const r=await fetch(API_BASE+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({email:normEmail,password:pw,name:nameInput.value.trim(),marketingOptIn:marketingChk.checked})}); const j=await r.json(); if(!j.ok){ showError(j); return; } user=j.user; try{ if(j.session?.id){ localStorage.setItem('sessionToken', j.session.id); } }catch(_){} statusEl.textContent='Successo!'; setTimeout(()=>{ closeAuth(); renderNav(); updateLandingButtons(); },500);}catch(err){ statusEl.textContent='Errore: '+err.message; }
    } else if(mode==='login'){
  const pw=passInput.value; statusEl.textContent='Login...'; try{ const r=await fetch(API_BASE+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({email,password:pw})}); const j=await r.json(); if(!j.ok){ statusEl.textContent='Errore: '+j.error; return; } user=j.user; try{ if(j.session?.id){ localStorage.setItem('sessionToken', j.session.id); } }catch(_){} statusEl.textContent='Benvenuto'; setTimeout(()=>{ closeAuth(); renderNav(); updateLandingButtons(); },400);}catch(err){ statusEl.textContent='Errore: '+err.message; }
    } else if(mode==='request-reset'){
      statusEl.textContent='Invio...';
      try{
        const r=await fetch(API_BASE+'/api/auth/request-reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:normEmail})});
        const j=await r.json();
        if(j.ok){
          statusEl.textContent='Se l\'email esiste riceverai un link di reset (controlla anche SPAM).';
          if(j.debugToken){
            // Provide a quick debug action: clickable link that opens reset mode with token
            const a=document.createElement('a');
            a.href='#'; a.textContent='[debug apri reset]'; a.style.marginLeft='6px'; a.style.fontSize='.6rem';
            a.addEventListener('click',ev=>{ ev.preventDefault(); if(resetTokenInput){ resetTokenInput.value=j.debugToken; } setMode('reset'); });
            statusEl.appendChild(a);
          }
        } else {
          showError(j);
        }
      }catch(err){ statusEl.textContent='Errore: '+err.message; }
    } else if(mode==='reset'){
      const pw=passInput.value, pw2=pass2Input.value; if(pw!==pw2){ statusEl.textContent='Password non coincidono'; return; }
      const token = resetTokenInput?.value.trim(); if(!token){ statusEl.textContent='Token mancante'; return; }
      statusEl.textContent='Reset...';
      try{
        const r=await fetch(API_BASE+'/api/auth/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,password:pw})});
        const j=await r.json();
        if(!j.ok){ showError(j); return; }
        statusEl.textContent='Password aggiornata. Ora login.';
        setTimeout(()=>{ setMode('login'); },600);
      }catch(err){ statusEl.textContent='Errore: '+err.message; }
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
  // Query param handling for reset token (?resetToken=...&email=...)
  try {
    const params = new URLSearchParams(location.search);
    const rt = params.get('resetToken');
    const em = params.get('email');
    if(rt){
      openAuth('reset');
      if(resetTokenInput) resetTokenInput.value = rt;
      if(em && emailInput) emailInput.value = em;
    }
  } catch(e){}
  loadSession();
  renderNav();
  updateLandingButtons();
  syncBodyAuthClass();
})();
