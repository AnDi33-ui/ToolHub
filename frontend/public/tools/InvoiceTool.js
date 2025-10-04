function InvoiceTool(){
  const API_BASE = (function(){
    if(window.API_BASE) return window.API_BASE.replace(/\/$/,'');
    if(location.port==='5173') return 'http://localhost:3000';
    return '';
  })();
  const [clients,setClients] = React.useState([]);
  const [showClientForm,setShowClientForm]=React.useState(false);
  const [cName,setCName]=React.useState('');
  const [cVat,setCVat]=React.useState('');
  const [cAddress,setCAddress]=React.useState('');
  const [cStatus,setCStatus]=React.useState('');
  const [clientId,setClientId]=React.useState('');
  const [taxRate,setTaxRate]=React.useState(22);
  const [currency,setCurrency]=React.useState('EUR');
  const [notes,setNotes]=React.useState('');
  const [items,setItems]=React.useState([{id:Math.random().toString(36).slice(2),desc:'Servizio',qty:1,price:100}]);
  const [invoices,setInvoices] = React.useState([]);
  const [status,setStatus] = React.useState('');
  const [loginRequired,setLoginRequired]=React.useState(false);
  const [authChecked,setAuthChecked]=React.useState(false);
  const [authError,setAuthError]=React.useState('');
  const [upgrading,setUpgrading]=React.useState(false);

  function debug(...a){ if(window.INVOICE_DEBUG) console.log('[InvoiceTool]',...a); }
  // === Item helpers (restored) ===
  function updateItem(id,field,val){ setItems(prev=> prev.map(it=> it.id===id? {...it,[field]: field==='desc'? val : Number(val)}:it)); }
  function addItem(){ setItems(prev=> [...prev,{id:Math.random().toString(36).slice(2),desc:'',qty:1,price:0}]); }
  function removeItem(id){ setItems(prev=> prev.filter(i=>i.id!==id)); }
  const totals = React.useMemo(()=>{ let subtotal=0; items.forEach(i=> subtotal += (Number(i.qty)||0)*(Number(i.price)||0)); const tax=subtotal*(Number(taxRate)||0)/100; return {subtotal,tax,total:subtotal+tax}; },[items,taxRate]);

  async function checkAuth(){
    setAuthError('');
    try {
      const r = await fetch(API_BASE + '/api/auth/me',{credentials:'include'});
      if(r.status===200){ const j = await r.json(); if(j.ok){ setAuthChecked(true); setLoginRequired(false); loadClients(); loadInvoices(); return; } }
      if(r.status===401){
        let legacyToken=null; try{ legacyToken=localStorage.getItem('sessionToken'); }catch(e){}
        if(legacyToken){
          setUpgrading(true);
          const r2 = await fetch(API_BASE + '/api/auth/me',{credentials:'include', headers:{'x-session-token':legacyToken}});
          if(r2.status===200){ const j2=await r2.json(); if(j2.ok){ setUpgrading(false); setAuthChecked(true); setLoginRequired(false); loadClients(); loadInvoices(); return; } }
          setUpgrading(false);
        }
        setLoginRequired(true); setAuthChecked(true); return; }
      setAuthError('Errore inatteso auth ('+r.status+')'); setAuthChecked(true);
    }catch(e){
      if(e && (e.message||'').includes('Failed to fetch')){
        setAuthError('Backend non raggiungibile su '+API_BASE+' (avvia il server)');
      } else {
        setAuthError('Errore rete auth: '+e.message);
      }
      setAuthChecked(true);
    }
  }

  async function loadClients(){
    try{ const r=await fetch(API_BASE+'/api/clients',{credentials:'include'}); if(r.status===401){ setLoginRequired(true); return; } const j=await r.json(); if(j.ok){ setClients(j.items); if(!clientId && j.items.length) setClientId(String(j.items[0].id)); } }catch(e){ }
  }
  async function loadInvoices(){
    try{ const r=await fetch(API_BASE+'/api/invoices',{credentials:'include'}); if(r.status===401){ setLoginRequired(true); return; } const j=await r.json(); if(j.ok) setInvoices(j.items); }catch(e){ }
  }
  React.useEffect(()=>{ checkAuth(); },[]);

  async function saveClient(){ if(loginRequired){ setStatus('Login richiesto'); return; } setCStatus('Salvataggio...'); try{ const payload={ name:cName, vat:cVat, address:cAddress }; const r=await fetch(API_BASE+'/api/clients',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); if(r.status===401){ setLoginRequired(true); setCStatus('Login richiesto'); return; } const j=await r.json(); if(j.ok){ setCStatus('Creato'); setCName(''); setCVat(''); setCAddress(''); loadClients(); setTimeout(()=>setCStatus(''),1200);} else { setCStatus('Errore'); } }catch(e){ setCStatus('Errore rete'); } }
  async function createInvoice(){ if(loginRequired){ setStatus('Login richiesto'); return; } if(!clientId){ setStatus('Seleziona cliente'); return; } setStatus('Creazione fattura...'); const payload={ clientId:Number(clientId), items:items.map(i=>({desc:i.desc,qty:i.qty,price:i.price})), taxRate:taxRate, currency, notes }; try{ const r=await fetch(API_BASE+'/api/invoices',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); if(r.status===401){ setLoginRequired(true); setStatus('Login richiesto'); return; } const j=await r.json(); if(!j.ok){ setStatus('Errore creazione'); return; } setStatus('Fattura #'+j.number+' pronta'); window.open(API_BASE+`/api/invoices/${j.id}/pdf`,'_blank'); loadInvoices(); }catch(e){ setStatus('Errore rete'); }}

  function openLogin(){
    // If global auth modal logic exists (from earlier implementation) trigger it
    if(window.showAuthModal){ window.showAuthModal('login'); }
    else if(document.querySelector('[data-auth-modal]')){
      document.querySelector('[data-auth-modal]').classList.add('open');
    }else{
      alert('Vai alla homepage per effettuare il login');
      location.href = '/';
    }
  }

  if(!authChecked){
    return <div className="tool-layout"><div className="card" style={{maxWidth:360}}><h3>Verifica sessione...</h3>{upgrading && <div style={{fontSize:12}}>Aggiornamento sessione legacy...</div>}{authError && <div style={{color:'red',fontSize:12}}>{authError}</div>}<div style={{display:'flex',gap:8,marginTop:8}}><button className="btn secondary" type="button" onClick={checkAuth}>Riprova</button><button className="btn secondary" type="button" onClick={()=>{window.INVOICE_DEBUG=1; checkAuth();}}>Debug</button></div></div></div>;
  }

  if(loginRequired){
    return (<div className="tool-layout"><div className="card" style={{maxWidth:380}}>
      <h3 style={{marginTop:0}}>Login richiesto</h3>
      <p style={{fontSize:'.7rem',lineHeight:1.4}}>Non rilevo una sessione valida. Se hai appena fatto login da un flusso vecchio, premi Riprova per convertirla.</p>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <button className="btn" type="button" onClick={openLogin}>Apri login</button>
        <button className="btn secondary" type="button" onClick={checkAuth}>Riprova</button>
        <button className="btn secondary" type="button" onClick={()=>{window.INVOICE_DEBUG=1; console.log('Cookies',document.cookie); checkAuth();}}>Debug</button>
      </div>
    </div></div>);
  }

  return (<div className="tool-layout">
    <h2 style={{marginTop:0}}>Fatture (Beta)</h2>
    <div style={{display:'grid',gap:18,gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',alignItems:'start'}}>
      <div className="card" style={{display:'grid',gap:10}}>
        <h3 style={{margin:0,fontSize:'.9rem'}}>Cliente</h3>
        <select value={clientId} onChange={e=>setClientId(e.target.value)}>{clients.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <button className="btn secondary" style={{fontSize:'.65rem'}} onClick={()=>setShowClientForm(s=>!s)}>{showClientForm? 'Chiudi':' + Nuovo cliente'}</button>
        {showClientForm && <div style={{display:'grid',gap:6}}>
          <input placeholder="Nome" value={cName} onChange={e=>setCName(e.target.value)} />
          <input placeholder="P.IVA" value={cVat} onChange={e=>setCVat(e.target.value)} />
          <textarea rows={2} placeholder="Indirizzo" value={cAddress} onChange={e=>setCAddress(e.target.value)} />
          <button className="btn" style={{fontSize:'.65rem'}} type="button" onClick={saveClient}>Salva cliente</button>
          <div style={{fontSize:'.55rem'}}>{cStatus}</div>
        </div>}
        <hr />
        <h3 style={{margin:'4px 0',fontSize:'.9rem'}}>Dettagli fattura</h3>
        <label style={{fontSize:'.65rem',display:'flex',alignItems:'center',gap:6}}>IVA % <input type="number" value={taxRate} min={0} step={1} style={{width:70}} onChange={e=>setTaxRate(Number(e.target.value)||0)} /></label>
        <label style={{fontSize:'.65rem',display:'flex',alignItems:'center',gap:6}}>Valuta <select value={currency} onChange={e=>setCurrency(e.target.value)}><option>EUR</option><option>USD</option><option>GBP</option></select></label>
        <textarea rows={3} placeholder="Note (facoltative)" style={{fontSize:'.65rem'}} value={notes} onChange={e=>setNotes(e.target.value)} />
      </div>
      <div className="card" style={{display:'grid',gap:8}}>
        <h3 style={{margin:0,fontSize:'.9rem'}}>Righe</h3>
        <div style={{display:'grid',gap:6}}>
          {items.map(it=> <div key={it.id} style={{display:'grid',gridTemplateColumns:'1.6fr 60px 70px 30px',gap:6}}>
            <input value={it.desc} placeholder="Descrizione" onChange={e=>updateItem(it.id,'desc',e.target.value)} />
            <input type="number" value={it.qty} onChange={e=>updateItem(it.id,'qty',e.target.value)} />
            <input type="number" value={it.price} onChange={e=>updateItem(it.id,'price',e.target.value)} />
            <button className="btn secondary" style={{fontSize:'.55rem'}} onClick={()=>removeItem(it.id)}>x</button>
          </div>)}
          <button className="btn secondary" style={{fontSize:'.65rem'}} onClick={addItem}>+ Aggiungi riga</button>
        </div>
        <div style={{fontSize:'.65rem',color:'var(--text-light)'}}>Subtotale: {totals.subtotal.toFixed(2)} | IVA: {totals.tax.toFixed(2)} | Totale: {totals.total.toFixed(2)} {currency}</div>
        <button className="btn" type="button" onClick={createInvoice}>Genera & Scarica PDF</button>
        <div style={{fontSize:'.6rem',color:'var(--text-light)'}}>{status}</div>
      </div>
      <div className="card" style={{display:'grid',gap:8}}>
        <h3 style={{margin:0,fontSize:'.9rem'}}>Fatture recenti</h3>
        <div style={{maxHeight:260,overflow:'auto',display:'grid',gap:4,fontSize:'.6rem'}}>
          {invoices.map(inv=> <div key={inv.id}>#{inv.number} - {(inv.total||0).toFixed(2)} {inv.currency} <button className="btn secondary" style={{fontSize:'.55rem'}} onClick={()=>window.open(API_BASE+`/api/invoices/${inv.id}/pdf`,'_blank')}>PDF</button></div>)}
          {invoices.length===0 && <div style={{opacity:.6}}>Nessuna fattura</div>}
        </div>
      </div>
    </div>
  </div>);
}
window.InvoiceTool = InvoiceTool;