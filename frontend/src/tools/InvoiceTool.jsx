// Rimuoviamo l'import di React: esbuild lo tratterà come esterno (global React)
// evitando la generazione di require('react') nel bundle iife.
/* global React */
// Shared utilities
import { apiFetch, ApiError, track } from '../shared/api.js';
import { currencyFormat, numberFormat } from '../shared/format.js';
import ProfileEditor from '../shared/ui/ProfileEditor.jsx';
import useBusinessProfile from '../shared/hooks/useBusinessProfile.js';

export function InvoiceTool(){
  const API_BASE = (window.API_BASE || (location.port==='5173'? 'http://localhost:3000':'')).replace(/\/$/,'');
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
  const noClients = clients.length===0;
  const [loadingData,setLoadingData] = React.useState(true);
  const { profile, refresh: refreshProfile } = useBusinessProfile(!loginRequired); // carica dopo auth
  const [profileEditorOpen,setProfileEditorOpen] = React.useState(false);

  function updateItem(id,field,val){ setItems(prev=> prev.map(it=> it.id===id? {...it,[field]: field==='desc'? val : Number(val)}:it)); }
  function addItem(){ setItems(prev=> [...prev,{id:Math.random().toString(36).slice(2),desc:'',qty:1,price:0}]); }
  function removeItem(id){ setItems(prev=> prev.filter(i=>i.id!==id)); }
  const totals = React.useMemo(()=>{ let subtotal=0; items.forEach(i=> subtotal += (Number(i.qty)||0)*(Number(i.price)||0)); const tax=subtotal*(Number(taxRate)||0)/100; return {subtotal,tax,total:subtotal+tax}; },[items,taxRate]);

  async function loadClients(){ try{ const j = await apiFetch('/api/clients'); if(j.ok){ setClients(j.items); if(!clientId && j.items.length) setClientId(String(j.items[0].id)); } }catch(e){ if(e.status===401){ setLoginRequired(true);} else { window.ToolHubToast?.('Errore caricamento clienti','error'); }} }
  async function loadInvoices(){ try{ const j = await apiFetch('/api/invoices'); if(j.ok) setInvoices(j.items); }catch(e){ if(e.status===401){ setLoginRequired(true);} else { window.ToolHubToast?.('Errore caricamento fatture','error'); }} }
  const appliedDefaultsRef = React.useRef(false);
  React.useEffect(()=>{
    if(profile && !appliedDefaultsRef.current){
      if(profile.aliquota_iva_default!=null) setTaxRate(Number(profile.aliquota_iva_default));
      if(profile.currency_default) setCurrency(profile.currency_default);
      if(profile.note_footer_default && !notes) setNotes(profile.note_footer_default);
      appliedDefaultsRef.current=true;
    }
  },[profile, notes]);

  async function checkAuth(){ setAuthError(''); setLoadingData(true); try{ const j=await apiFetch('/api/auth/me'); if(j.ok){ setAuthChecked(true); setLoginRequired(false); await Promise.all([loadClients(), loadInvoices(), refreshProfile()]); setLoadingData(false); return; } } catch(e){ if(e.status===401){ let legacy=null; try{ legacy=localStorage.getItem('sessionToken'); }catch(_){ } if(legacy){ setUpgrading(true); try { const j2=await apiFetch('/api/auth/me',{ headers:{'x-session-token':legacy}}); if(j2.ok){ setAuthChecked(true); setLoginRequired(false); setUpgrading(false); await Promise.all([loadClients(), loadInvoices(), refreshProfile()]); setLoadingData(false); return; } } catch(err){ /* ignore */ } setUpgrading(false); setLoginRequired(true); setAuthChecked(true); setLoadingData(false); return; } setLoginRequired(true); setAuthChecked(true); setLoadingData(false); return;} setAuthError(e.message||'Errore auth'); setAuthChecked(true); setLoadingData(false); }}
  React.useEffect(()=>{ checkAuth(); },[]);

  function validateClient(){ if(!cName.trim()) return 'Nome cliente obbligatorio'; return null; }
  async function saveClient(){ if(loginRequired){ setStatus('Login richiesto'); return; } const vErr=validateClient(); if(vErr){ setCStatus(vErr); window.ToolHubToast?.(vErr,'warn'); return; } setCStatus('Salvataggio...'); try{ const payload={ name:cName.trim(), vat:cVat.trim(), address:cAddress.trim() }; const j=await apiFetch('/api/clients',{ method:'POST', body:payload }); if(j.ok){ track('client_create',{ id:j.id }); window.ToolHubToast?.('Cliente creato','success'); setCStatus('Creato'); setCName(''); setCVat(''); setCAddress(''); const wasEmpty = clients.length===0; await loadClients(); if(wasEmpty) setShowClientForm(false); setTimeout(()=>setCStatus(''),900);} else { setCStatus('Errore'); window.ToolHubToast?.('Errore creazione cliente','error'); } }catch(e){ if(e.status===401){ setLoginRequired(true); setCStatus('Login richiesto'); window.ToolHubToast?.('Sessione scaduta','warn'); } else { setCStatus(e.message||'Errore rete'); window.ToolHubToast?.(e.message||'Errore rete','error'); } } }
  function rowsValid(){ return items.length>0 && items.every(r=> r.desc.trim() && (r.qty>0) && (r.price>=0)); }
  async function createInvoice(){ if(loginRequired){ setStatus('Login richiesto'); window.ToolHubToast?.('Devi eseguire login','warn'); return; } if(!clientId){ setStatus('Seleziona cliente'); window.ToolHubToast?.('Seleziona un cliente','warn'); return; } if(!rowsValid()){ setStatus('Righe non valide'); window.ToolHubToast?.('Correggi le righe prima di procedere','warn'); return; } setStatus('Creazione fattura...'); window.ToolHubToast?.('Creazione fattura...','info',{timeout:1800}); const payload={ clientId:Number(clientId), items:items.map(i=>({desc:i.desc.trim(),qty:i.qty,price:i.price})), taxRate:taxRate, currency, notes }; try{ const j=await apiFetch('/api/invoices',{ method:'POST', body:payload }); if(!j.ok){ setStatus('Errore creazione'); window.ToolHubToast?.('Errore creazione','error'); return; } setStatus('Fattura #'+j.number+' pronta'); track('invoice_create',{ invoiceId:j.id, total:j.total }); window.ToolHubToast?.('Fattura generata','success'); window.open(API_BASE+`/api/invoices/${j.id}/pdf`,'_blank'); loadInvoices(); }catch(e){ if(e.status===401){ setLoginRequired(true); setStatus('Login richiesto'); window.ToolHubToast?.('Sessione scaduta','warn'); } else { setStatus(e.message||'Errore rete'); window.ToolHubToast?.(e.message||'Errore rete','error'); } }}

  function openLogin(){ if(window.showAuthModal){ window.showAuthModal('login'); } else if(document.querySelector('[data-auth-modal]')){ document.querySelector('[data-auth-modal]').classList.add('open'); } else { alert('Vai alla home per il login'); location.href='/'; } }

  if(!authChecked){ return <div className="tool-layout"><div className="card" style={{maxWidth:360}}><h3>Verifica sessione...</h3>{upgrading && <div style={{fontSize:12}}>Upgrade sessione legacy...</div>}{authError && <div style={{color:'red',fontSize:12}}>{authError}</div>}<div style={{display:'flex',gap:8,marginTop:8}}><button className="btn secondary" onClick={checkAuth}>Riprova</button></div></div></div>; }
  if(loginRequired){ return <div className="tool-layout"><div className="card" style={{maxWidth:380}}><h3>Login richiesto</h3><p style={{fontSize:'.7rem'}}>Sessione non valida. Se hai usato un vecchio flusso, riprova per convertila.</p><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className="btn" onClick={openLogin}>Apri login</button><button className="btn secondary" onClick={checkAuth}>Riprova</button></div></div></div>; }

  // Auto-apri il form nuovo cliente se la lista è vuota dopo il caricamento auth
  React.useEffect(()=>{ if(authChecked && !loginRequired && clients.length===0){ setShowClientForm(true); setClientId(''); } },[clients,authChecked,loginRequired]);

  return <div className="tool-layout">
    <h2 style={{marginTop:0,display:'flex',alignItems:'center',gap:12}}>Fatture (Build) <button className="btn secondary" style={{fontSize:'.6rem'}} onClick={()=>setProfileEditorOpen(true)}>Profilo</button></h2>
    <div style={{display:'grid',gap:18,gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',alignItems:'start'}}>
      <div className="card" style={{display:'grid',gap:10}}>
        <h3 style={{margin:0,fontSize:'.9rem'}}>Cliente</h3>
        <select value={clientId} disabled={noClients} onChange={e=>setClientId(e.target.value)}>
          {noClients && <option value="">Nessun cliente - crea il primo</option>}
          {clients.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {noClients && <div style={{fontSize:'.55rem',color:'var(--text-light)'}}>Compila il form per creare il primo cliente.</div>}
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
        <h3 style={{margin:0,fontSize:'.9rem'}}>Righe { !rowsValid() && <span style={{fontSize:10,color:'#dc2626',fontWeight:500}}>• verifica campi</span>}</h3>
        <div style={{display:'grid',gap:6}}>
          {items.map(it=> <div key={it.id} style={{display:'grid',gridTemplateColumns:'1.3fr 60px 80px 90px 30px',gap:6,alignItems:'center'}}>
            <input value={it.desc} placeholder="Descrizione" onChange={e=>updateItem(it.id,'desc',e.target.value)} />
            <input type="number" min={0} value={it.qty} onChange={e=>updateItem(it.id,'qty',e.target.value)} />
            <input type="number" min={0} value={it.price} onChange={e=>updateItem(it.id,'price',e.target.value)} />
            <div style={{fontSize:10,opacity:.7,textAlign:'right'}}>{currencyFormat((Number(it.qty)||0)*(Number(it.price)||0), currency)}</div>
            <button aria-label="Rimuovi riga" className="btn secondary" style={{fontSize:'.55rem'}} onClick={()=>removeItem(it.id)}>x</button>
          </div>)}
          <button className="btn secondary" style={{fontSize:'.65rem'}} onClick={addItem}>+ Aggiungi riga</button>
        </div>
        <div style={{fontSize:'.65rem',color:'var(--text-light)'}}>Subtotale: {currencyFormat(totals.subtotal,currency)} | IVA: {currencyFormat(totals.tax,currency)} | Totale: <strong>{currencyFormat(totals.total,currency)}</strong></div>
        <button className="btn" type="button" disabled={!clientId || noClients || !rowsValid()} onClick={createInvoice} title={noClients? 'Crea prima un cliente':'Genera PDF fattura'}>Genera & Scarica PDF</button>
        <div style={{fontSize:'.6rem',color:'var(--text-light)'}}>{status}</div>
      </div>
      <div className="card" style={{display:'grid',gap:8}}>
        <h3 style={{margin:0,fontSize:'.9rem'}}>Fatture recenti</h3>
        <div style={{maxHeight:260,overflow:'auto',display:'grid',gap:4,fontSize:'.6rem'}}>
          {loadingData && <div className="skeleton" style={{height:12,width:'60%'}} />}
          {!loadingData && invoices.map(inv=> <div key={inv.id}>#{inv.number} - {currencyFormat(inv.total||0,inv.currency||currency)} <button className="btn secondary" style={{fontSize:'.55rem'}} onClick={()=>window.open(API_BASE+`/api/invoices/${inv.id}/pdf`,'_blank')}>PDF</button></div>)}
          {!loadingData && invoices.length===0 && <div style={{opacity:.6}}>Nessuna fattura</div>}
        </div>
      </div>
    </div>
  {profileEditorOpen && <ProfileEditor profile={profile} onClose={()=>setProfileEditorOpen(false)} onSaved={()=>{ refreshProfile(); setProfileEditorOpen(false); window.ToolHubToast?.('Profilo aggiornato','success'); }} />}
  </div>;
}

export default InvoiceTool;
