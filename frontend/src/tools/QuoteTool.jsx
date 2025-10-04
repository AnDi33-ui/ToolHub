// Usa React globale (UMD) senza import per evitare require dinamico
/* global React */
import { apiFetch, track } from '../shared/api.js';
import { currencyFormat } from '../shared/format.js';

export function QuoteTool(){
  const API_BASE = (window.API_BASE || (location.port==='5173'?'http://localhost:3000':''));
  const [items,setItems] = React.useState([{desc:'Voce 1',qty:1,price:100}]);
  const [currency,setCurrency] = React.useState('EUR');
  const [discount,setDiscount] = React.useState(0);
  const [convertTo,setConvertTo] = React.useState('');
  const [rateOverride,setRateOverride] = React.useState('');
  const [templates,setTemplates] = React.useState([]);
  const [user,setUser] = React.useState(null);
  const [logo,setLogo] = React.useState(null);
  const [vat,setVat] = React.useState(22);
  const [note,setNote] = React.useState('Grazie per la preferenza. Pagamento a 30 giorni.');
  const [client,setClient] = React.useState({name:'Cliente Demo',address:'Via Esempio 123'});
  const [company,setCompany] = React.useState({name:'La Mia Azienda',address:'Via Centrale 1'});
  const [busy,setBusy] = React.useState(false);
  const [error,setError] = React.useState('');
  const [highDiscConfirmed,setHighDiscConfirmed] = React.useState(false);
  const [loadingTemplates,setLoadingTemplates] = React.useState(false);
  React.useEffect(()=>{ apiFetch('/api/auth/me').then(j=>{ if(j.ok) setUser(j.user); }).catch(()=>{}); },[]);
  function addItem(){ setItems(prev=> [...prev,{desc:'',qty:1,price:0}]); }
  function update(i,field,val){ setItems(prev=> prev.map((it,idx)=> idx===i? {...it,[field]: field==='desc'? val : val}:it)); }
  function remove(i){ setItems(prev=> prev.filter((_,idx)=> idx!==i)); }
  function rowsValid(){ return items.length>0 && items.every(r=> (r.desc||'').trim() && (parseFloat(r.qty)>0) && (parseFloat(r.price)>=0)); }
  function totals(){ const subtotal = items.reduce((s,it)=> s + (parseFloat(it.qty)||0)*(parseFloat(it.price)||0),0); const disc = subtotal * (parseFloat(discount)||0)/100; const taxedBase = subtotal - disc; const vatAmount = taxedBase * (parseFloat(vat)||0)/100; const total = taxedBase + vatAmount; return { subtotal, disc, vatAmount, total }; }
  async function exportPDF(){ if(!user){ setError('Login richiesto'); window.ToolHubToast?.('Login richiesto','warn'); return; } if(!rowsValid()){ setError('Righe non valide'); window.ToolHubToast?.('Correggi le righe prima di esportare','warn'); return; } const discVal = parseFloat(discount)||0; if(discVal>40 && !highDiscConfirmed){ const ok = window.confirm('Sconto superiore al 40%. Confermi?'); if(!ok) return; setHighDiscConfirmed(true); }
    setBusy(true); setError(''); window.ToolHubToast?.('Generazione PDF...','info',{timeout:2000});
    try{ const payload = { lineItems: items.map(i=>({desc:i.desc.trim(),qty:parseFloat(i.qty)||0,price:parseFloat(i.price)||0})), currency, discount: discVal, vatRate: parseFloat(vat)||0, notes: note, client: client.name, clientAddress: client.address, company:{ name: company.name, address: company.address }, logo, convertTo: convertTo||undefined, rateOverride: rateOverride||undefined }; const r = await fetch(API_BASE + '/api/export/quote',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify(payload)}); if(!r.ok){ let j={}; try{ j=await r.json(); }catch(_){ } setError(j.error||'Errore'); window.ToolHubToast?.(j.error||'Errore export','error'); track('quote_export_error',{ status:r.status, error:j.error }); } else { const blob = await r.blob(); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='preventivo.pdf'; a.click(); URL.revokeObjectURL(url); window.ToolHubToast?.('Preventivo esportato','success'); track('quote_export_success',{ total: payload.lineItems.reduce((s,li)=> s + li.qty*li.price,0), discount:discVal, currency }); } }catch(err){ setError('Errore rete: '+err.message); window.ToolHubToast?.(err.message||'Errore rete','error'); track('quote_export_exception',{ message:err.message }); } finally { setBusy(false); } }
  async function saveTemplate(){ if(!user){ window.ToolHubToast?.('Login richiesto','warn'); return; } const name = prompt('Nome template:'); if(!name) return; const payload = { lineItems: items, currency, discount: parseFloat(discount)||0, vatRate: parseFloat(vat)||0, notes: note, client, company }; try{ const j= await apiFetch('/api/templates/quote',{ method:'POST', body:{name,payload} }); if(!j.ok){ window.ToolHubToast?.('Errore salvataggio','error'); track('quote_template_error',{ name }); } else { window.ToolHubToast?.('Template salvato','success'); track('quote_template_saved',{ name, items:items.length }); loadTemplates(); } }catch(err){ window.ToolHubToast?.(err.message||'Errore rete','error'); track('quote_template_exception',{ message:err.message }); } }
  async function loadTemplates(){ if(!user){ window.ToolHubToast?.('Login per caricare template','info'); return; } setLoadingTemplates(true); try{ const j= await apiFetch('/api/templates/quote'); if(j.ok) setTemplates(j.items||[]); }catch(err){ window.ToolHubToast?.('Errore caricamento template','error'); } finally { setLoadingTemplates(false); } }
  async function applyTemplate(id){ if(!user) return; try{ const j= await apiFetch('/api/templates/quote/'+id); if(j.ok){ const p=j.item.payload; if(p.lineItems) setItems(p.lineItems); if(p.currency) setCurrency(p.currency); if(p.discount!=null) setDiscount(p.discount); if(p.vatRate!=null) setVat(p.vatRate); if(p.notes) setNote(p.notes); if(p.client) setClient({name:p.client,address:p.clientAddress||''}); if(p.company) setCompany({name:p.company.name,address:p.company.address}); window.ToolHubToast?.('Template applicato','success'); } }catch(err){ window.ToolHubToast?.('Errore template','error'); } }
  const { subtotal, disc, vatAmount, total } = totals();
  const convHint = convertTo && !rateOverride ? (<div style={{fontSize:10,opacity:.6}}>Conversione finale lato server ({convertTo})</div>) : null;
  return <div className="card">
    <h3>Generatore di preventivi PDF</h3>
    <p style={{fontSize:12,opacity:.7,margin:'4px 0 10px'}}>Crea preventivi professionali con logo, sconto, IVA e valuta. I dati restano temporanei nel browser.</p>
    <div style={{display:'grid',gap:12}}>
      <details open>
        <summary style={{cursor:'pointer',fontSize:12,opacity:.75}}>Dati azienda / cliente</summary>
        <div style={{display:'grid',gap:8,marginTop:8}}>
          <input placeholder="Tua azienda" value={company.name} onChange={e=>setCompany({...company,name:e.target.value})} />
          <textarea rows={2} placeholder="Indirizzo azienda" value={company.address} onChange={e=>setCompany({...company,address:e.target.value})} />
          <input placeholder="Cliente" value={client.name} onChange={e=>setClient({...client,name:e.target.value})} />
          <textarea rows={2} placeholder="Indirizzo cliente" value={client.address} onChange={e=>setClient({...client,address:e.target.value})} />
        </div>
      </details>
      <details open>
        <summary style={{cursor:'pointer',fontSize:12,opacity:.75}}>Voci di costo { !rowsValid() && <span style={{color:'#dc2626',fontSize:10}}>• verifica righe</span>}</summary>
        <div style={{display:'grid',gap:8,marginTop:8}}>
          {items.map((it,i)=>(
            <div key={i} style={{display:'grid',gridTemplateColumns:'1.6fr 70px 100px 110px 34px',gap:8,alignItems:'center'}}>
              <input placeholder="Descrizione" value={it.desc} onChange={e=>update(i,'desc',e.target.value)} />
              <input inputMode="decimal" placeholder="Qta" value={it.qty} onChange={e=>update(i,'qty',e.target.value)} />
              <input inputMode="decimal" placeholder="Prezzo" value={it.price} onChange={e=>update(i,'price',e.target.value)} />
              <div style={{fontSize:11,opacity:.65,textAlign:'right'}}>{currencyFormat((parseFloat(it.qty)||0)*(parseFloat(it.price)||0), currency)}</div>
              <button type="button" className="btn secondary" style={{padding:'6px 8px'}} onClick={()=>remove(i)} aria-label="Rimuovi riga">✕</button>
            </div>
          ))}
          <button className="btn outline" type="button" onClick={addItem}>+ Aggiungi voce</button>
        </div>
      </details>
      <details>
        <summary style={{cursor:'pointer',fontSize:12,opacity:.75}}>Logo, sconto, IVA, valuta</summary>
        <div style={{display:'grid',gap:8,marginTop:8}}>
          <input type="file" accept="image/*" onChange={e=>{ const file=e.target.files&&e.target.files[0]; if(!file) return; const reader=new FileReader(); reader.onload=ev=> setLogo(ev.target.result); reader.readAsDataURL(file); }} />
          {logo && <div style={{display:'flex',alignItems:'center',gap:10}}><img alt="logo" src={logo} style={{height:32,objectFit:'contain',border:'1px solid var(--border)',padding:4,borderRadius:6,background:'#fff'}} /><span style={{fontSize:10,opacity:.6}}>Logo caricato</span></div>}
          <input inputMode="decimal" placeholder="Sconto %" value={discount} onChange={e=>{ setDiscount(e.target.value); setHighDiscConfirmed(false); }} />
          <input inputMode="decimal" placeholder="IVA %" value={vat} onChange={e=>setVat(e.target.value)} />
          <select value={currency} onChange={e=>setCurrency(e.target.value)}>
            <option value="EUR">EUR €</option>
            <option value="USD">USD $</option>
            <option value="GBP">GBP £</option>
          </select>
          <select value={convertTo} onChange={e=>setConvertTo(e.target.value)}>
            <option value="">Converti in (opzionale)</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
            <option value="GBP">GBP</option>
          </select>
          <input placeholder="Rate override (opz.)" value={rateOverride} onChange={e=>setRateOverride(e.target.value)} />
          {convHint}
        </div>
      </details>
      <details>
        <summary style={{cursor:'pointer',fontSize:12,opacity:.75}}>Template</summary>
        <div style={{display:'grid',gap:6,marginTop:8}}>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            <button type="button" className="btn secondary" onClick={saveTemplate}>Salva template</button>
            <button type="button" className="btn outline" onClick={loadTemplates} disabled={loadingTemplates}>{loadingTemplates? 'Carico...' : 'Ricarica lista'}</button>
          </div>
          {templates.length>0 && (
            <div style={{display:'grid',gap:4}}>
              {templates.map(t=> <button type="button" key={t.id} className="btn secondary" onClick={()=>applyTemplate(t.id)}>{t.name}</button>)}
            </div>
          )}
          {!loadingTemplates && templates.length===0 && user && <div style={{fontSize:11,opacity:.6}}>Nessun template salvato</div>}
          {!user && <div style={{fontSize:11,opacity:.7}}>Login per salvare template.</div>}
        </div>
      </details>
      <details>
        <summary style={{cursor:'pointer',fontSize:12,opacity:.75}}>Note / termini</summary>
        <textarea rows={3} value={note} onChange={e=>setNote(e.target.value)} style={{marginTop:8}} />
      </details>
      <div style={{fontSize:12,background:'var(--bg-muted)',padding:8,borderRadius:8}}>
        <div>Subtotale: {currencyFormat(subtotal,currency)}</div>
        <div>Sconto: -{currencyFormat(disc,currency)}</div>
        <div>IVA: {currencyFormat(vatAmount,currency)}</div>
        <div><strong>Totale: {currencyFormat(total,currency)}</strong></div>
      </div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <button className="btn" disabled={busy || !rowsValid()} type="button" onClick={exportPDF}>{busy? 'Generazione...' : 'Esporta PDF'}</button>
        {discount>40 && !highDiscConfirmed && <span style={{fontSize:10,color:'#dc2626'}}>Sconto alto: sarà richiesta conferma</span>}
      </div>
      {error && <div style={{color:'red',fontSize:12}}>{error}</div>}
    </div>
  </div>;
}
export default QuoteTool;
