// Migrated QuoteTool (same as legacy)
/* QuoteTool - generatore preventivi con line items, sconto, logo, valuta e PDF */
function QuoteTool(){
  const API_BASE = (window.API_BASE || (location.port==='5173'?'http://localhost:3000':'')).replace(/\/$/,'');
  const [items,setItems] = React.useState([{desc:'Voce 1',qty:1,price:100}]);
  const [currency,setCurrency] = React.useState('EUR');
  const [discount,setDiscount] = React.useState(0);
  const [convertTo,setConvertTo] = React.useState('');
  const [rateOverride,setRateOverride] = React.useState('');
  const [templates,setTemplates] = React.useState([]);
  const [user,setUser] = React.useState(null);
  React.useEffect(()=>{ fetch(API_BASE + '/api/auth/me',{credentials:'include'}).then(r=>r.json()).then(j=>{ if(j.ok) setUser(j.user); }).catch(()=>{}); },[]);
  const [logo,setLogo] = React.useState(null);
  const [vat,setVat] = React.useState(22);
  const [note,setNote] = React.useState('Grazie per la preferenza. Pagamento a 30 giorni.');
  const [client,setClient] = React.useState({name:'Cliente Demo',address:'Via Esempio 123'});
  const [company,setCompany] = React.useState({name:'La Mia Azienda',address:'Via Centrale 1'});
  const [busy,setBusy] = React.useState(false);
  const [error,setError] = React.useState('');
  function addItem(){ setItems(prev=> [...prev,{desc:'',qty:1,price:0}]); }
  function update(i,field,val){ setItems(prev=> prev.map((it,idx)=> idx===i? {...it,[field]:val}:it)); }
  function remove(i){ setItems(prev=> prev.filter((_,idx)=> idx!==i)); }
  function totals(){
    const subtotal = items.reduce((s,it)=> s + (parseFloat(it.qty)||0)*(parseFloat(it.price)||0),0);
    const disc = subtotal * (parseFloat(discount)||0)/100;
    const taxedBase = subtotal - disc;
    const vatAmount = taxedBase * (parseFloat(vat)||0)/100;
    const total = taxedBase + vatAmount;
    return { subtotal, disc, vatAmount, total };
  }
  async function exportPDF(){
    setBusy(true); setError('');
    try{
  const payload = { lineItems: items, currency, discount: parseFloat(discount)||0, vatRate: parseFloat(vat)||0, notes: note, client: client.name, clientAddress: client.address, company:{ name: company.name, address: company.address }, logo, convertTo: convertTo||undefined, rateOverride: rateOverride||undefined };
  if(!user){ setError('Login richiesto'); setBusy(false); return; }
  const r = await fetch(API_BASE + '/api/export/quote',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify(payload)});
      if(!r.ok){ const j = await r.json(); setError(j.error||'Errore'); }
      else { const blob = await r.blob(); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='preventivo.pdf'; a.click(); URL.revokeObjectURL(url); }
    }catch(err){ setError('Errore rete: '+err.message); }
    finally { setBusy(false); }
  }
  function onLogo(e){ const file = e.target.files && e.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onload = ev=> setLogo(ev.target.result); reader.readAsDataURL(file); }
  const { subtotal, disc, vatAmount, total } = totals();
  async function saveTemplate(){
    if(!user){ alert('Login richiesto'); return; }
    const name = prompt('Nome template:'); if(!name) return;
    const payload = { lineItems: items, currency, discount, vatRate: vat, notes: note, client, company };
    try{
  const r = await fetch(API_BASE + '/api/templates/quote',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({name,payload})});
      const j = await r.json(); if(!j.ok) alert('Errore: '+j.error); else { loadTemplates(); }
    }catch(err){ alert('Errore rete: '+err.message); }
  }
  async function loadTemplates(){
    if(!user){ alert('Login per caricare template'); return; }
    try{ const r=await fetch(API_BASE + '/api/templates/quote',{credentials:'include'}); const j=await r.json(); if(j.ok) setTemplates(j.items||[]); }catch(err){ console.warn(err); }
  }
  async function applyTemplate(id){
    if(!user) return;
    try{ const r=await fetch(API_BASE + '/api/templates/quote/'+id,{credentials:'include'}); const j=await r.json(); if(j.ok){ const p=j.item.payload; if(p.lineItems) setItems(p.lineItems); if(p.currency) setCurrency(p.currency); if(p.discount!=null) setDiscount(p.discount); if(p.vatRate!=null) setVat(p.vatRate); if(p.notes) setNote(p.notes); if(p.client) setClient({name:p.client,address:p.clientAddress||''}); if(p.company) setCompany({name:p.company.name,address:p.company.address}); }
    }catch(err){ console.warn(err); }
  }
  return (
    <div className="card">
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
          <summary style={{cursor:'pointer',fontSize:12,opacity:.75}}>Voci di costo</summary>
          <div style={{display:'grid',gap:8,marginTop:8}}>
            {items.map((it,i)=>(
              <div key={i} style={{display:'grid',gridTemplateColumns:'2fr 70px 100px 34px',gap:8}}>
                <input placeholder="Descrizione" value={it.desc} onChange={e=>update(i,'desc',e.target.value)} />
                <input inputMode="decimal" placeholder="Qta" value={it.qty} onChange={e=>update(i,'qty',e.target.value)} />
                <input inputMode="decimal" placeholder="Prezzo" value={it.price} onChange={e=>update(i,'price',e.target.value)} />
                <button type="button" className="btn secondary" style={{padding:'6px 8px'}} onClick={()=>remove(i)}>✕</button>
              </div>
            ))}
            <button className="btn outline" type="button" onClick={addItem}>+ Aggiungi voce</button>
          </div>
        </details>
        <details>
          <summary style={{cursor:'pointer',fontSize:12,opacity:.75}}>Logo, sconto, IVA, valuta</summary>
          <div style={{display:'grid',gap:8,marginTop:8}}>
            <input type="file" accept="image/*" onChange={onLogo} />
            <input inputMode="decimal" placeholder="Sconto %" value={discount} onChange={e=>setDiscount(e.target.value)} />
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
          </div>
        </details>
        <details>
          <summary style={{cursor:'pointer',fontSize:12,opacity:.75}}>Template</summary>
          <div style={{display:'grid',gap:6,marginTop:8}}>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              <button type="button" className="btn secondary" onClick={saveTemplate}>Salva template</button>
              <button type="button" className="btn outline" onClick={loadTemplates}>Ricarica lista</button>
            </div>
            {templates.length>0 && (
              <div style={{display:'grid',gap:4}}>
                {templates.map(t=> <button type="button" key={t.id} className="btn secondary" onClick={()=>applyTemplate(t.id)}>{t.name}</button>)}
              </div>
            )}
            {!user && <div style={{fontSize:11,opacity:.7}}>Login per salvare template.</div>}
          </div>
        </details>
        <details>
          <summary style={{cursor:'pointer',fontSize:12,opacity:.75}}>Note / termini</summary>
          <textarea rows={3} value={note} onChange={e=>setNote(e.target.value)} style={{marginTop:8}} />
        </details>
        <div style={{fontSize:12,background:'#f1f5f9',padding:8,borderRadius:8}}>
          <div>Subtotale: {subtotal.toFixed(2)} {currency}</div>
          <div>Sconto: -{disc.toFixed(2)} {currency}</div>
            <div>IVA: {vatAmount.toFixed(2)} {currency}</div>
          <div><strong>Totale: {total.toFixed(2)} {currency}</strong></div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="btn" disabled={busy} type="button" onClick={exportPDF}>{busy? 'Generazione...':'Esporta PDF'}</button>
          {logo && <span style={{fontSize:10,opacity:.6}}>Logo caricato ✔</span>}
        </div>
        {error && <div style={{color:'red',fontSize:12}}>{error}</div>}
      </div>
    </div>
  );
}
window.QuoteTool = QuoteTool;
// placeholder copy
// Template helpers
function saveTemplate(){
  try { const t = localStorage.getItem('sessionToken'); if(!t){ alert('Login richiesto'); return; } }catch(_){ }
}
