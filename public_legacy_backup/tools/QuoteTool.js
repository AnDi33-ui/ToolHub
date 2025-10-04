function QuoteTool({token}){
  const [client, setClient] = React.useState('');
  const [clientAddress,setClientAddress] = React.useState('');
  const [companyName,setCompanyName] = React.useState('La Mia Azienda Srl');
  const [companyAddress,setCompanyAddress] = React.useState('Via Esempio 123\nMilano, IT');
  const [companyVat,setCompanyVat] = React.useState('IT00000000000');
  const [notes,setNotes] = React.useState('Pagamento a 30 giorni. Offerta valida 15 giorni.');
  const [currency,setCurrency] = React.useState('EUR');
  const [discount,setDiscount] = React.useState('0');
  const [logoData,setLogoData] = React.useState('');
  const [vatRate, setVatRate] = React.useState('22');
  const [items, setItems] = React.useState([{ desc:'', qty:1, price:'' }]);
  const [error,setError] = React.useState('');

  function updateItem(i, field, value){
    setItems(prev => prev.map((it,idx)=> idx===i? {...it,[field]:field==='desc'? value : value}: it));
  }
  function addItem(){ setItems(prev=> [...prev,{ desc:'', qty:1, price:'' }]); }
  function removeItem(i){ setItems(prev=> prev.filter((_,idx)=> idx!==i)); }

  function computeTotals(){
    let subtotal = 0;
    items.forEach(it=>{ const q = parseFloat(it.qty)||0; const p = parseFloat(it.price)||0; subtotal += q*p; });
    const vat = subtotal * ((parseFloat(vatRate)||0)/100);
    return { subtotal, vat, total: subtotal+vat };
  }
  const totals = computeTotals();

  async function download(){
    setError('');
    const cleanItems = items.filter(i=> (i.desc||'').trim() && (parseFloat(i.qty)>0) && (parseFloat(i.price)>=0));
    if(!cleanItems.length){ setError('Aggiungi almeno una voce valida'); return; }
  const payload = { client, clientAddress, lineItems: cleanItems, vatRate: parseFloat(vatRate)||0, discount: parseFloat(discount)||0, currency, notes, company:{ name: companyName, address: companyAddress, vat: companyVat }, logo: logoData };
    const res = await fetch('/api/export/quote', { method:'POST', headers:{'Content-Type':'application/json','x-session-token': token||''}, body: JSON.stringify(payload) });
    if(res.status===429){
      const j = await res.json();
      alert(j.error);
      return;
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'preventivo.pdf'; a.click();
    window.URL.revokeObjectURL(url);
    // Log download
    fetch('/api/usage', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ toolKey:'quote', action:'download' }) });
  }

  return (
    <div className="card">
      <h3>Generatore di preventivi PDF</h3>
      <p style={{fontSize:12,opacity:.7,margin:'4px 0 10px'}}>Inserisci le voci (descrizione, quantità, prezzo unitario). L'IVA verrà calcolata automaticamente. Ideale per bozze rapide da inviare ai clienti.</p>
      <div style={{display:'grid',gap:10,marginTop:6}}>
        <input placeholder="Cliente" value={client} onChange={e=>setClient(e.target.value)} />
        <textarea rows={2} placeholder="Indirizzo cliente" value={clientAddress} onChange={e=>setClientAddress(e.target.value)} />
        <details>
          <summary style={{fontSize:12,opacity:.7,cursor:'pointer'}}>Dati azienda / intestazione (opzionali)</summary>
          <div style={{display:'grid',gap:8,marginTop:8}}>
            <input placeholder="Nome azienda" value={companyName} onChange={e=>setCompanyName(e.target.value)} />
            <textarea rows={2} placeholder="Indirizzo azienda" value={companyAddress} onChange={e=>setCompanyAddress(e.target.value)} />
            <input placeholder="P.IVA" value={companyVat} onChange={e=>setCompanyVat(e.target.value)} />
            <textarea rows={2} placeholder="Note / Termini" value={notes} onChange={e=>setNotes(e.target.value)} />
            <div style={{display:'grid',gap:6}}>
              <label style={{fontSize:11,opacity:.7}}>Logo (PNG/JPG piccolo)</label>
              <input type="file" accept="image/*" onChange={e=>{
                const files = e.target && e.target.files ? e.target.files : null;
                const f = files && files.length ? files[0] : null;
                if(!f) return;
                const r=new FileReader();
                r.onload = function(){ setLogoData(r.result); };
                r.readAsDataURL(f);
              }} />
              {logoData && <img src={logoData} alt="logo" style={{height:50,objectFit:'contain',border:'1px solid #e2e8f0',padding:4,borderRadius:6,background:'#fff'}} />}
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <div style={{flex:'1 1 120px'}}>
                <label style={{fontSize:11,opacity:.7,display:'block',marginBottom:4}}>Valuta</label>
                <select value={currency} onChange={e=>setCurrency(e.target.value)}>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <div style={{flex:'1 1 120px'}}>
                <label style={{fontSize:11,opacity:.7,display:'block',marginBottom:4}}>Sconto (valore)</label>
                <input value={discount} onChange={e=>setDiscount(e.target.value)} />
              </div>
            </div>
            <div style={{fontSize:11,opacity:.6}}>Il logo resta lato client (base64) nel payload. Per memorizzarlo lato server aggiungere salvataggio file.</div>
          </div>
        </details>
      </div>
      <div style={{marginTop:12,fontSize:'.75rem',opacity:.7}}>Line Items</div>
      <div style={{display:'grid',gap:10}}>
        {items.map((it,i)=> (
          <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 70px 90px 36px',gap:8,alignItems:'center'}}>
            <input placeholder="Descrizione" value={it.desc} onChange={e=>updateItem(i,'desc',e.target.value)} />
            <input placeholder="Qta" value={it.qty} onChange={e=>updateItem(i,'qty',e.target.value)} />
            <input placeholder="Prezzo" value={it.price} onChange={e=>updateItem(i,'price',e.target.value)} />
            <button className="btn secondary" type="button" onClick={()=>removeItem(i)} aria-label="Rimuovi" style={{padding:'6px 8px'}}>✕</button>
          </div>
        ))}
        <button type="button" className="btn outline" onClick={addItem}>+ Aggiungi voce</button>
      </div>
      <div style={{display:'flex',gap:12,marginTop:14}}>
        <input style={{maxWidth:100}} placeholder="IVA %" value={vatRate} onChange={e=>setVatRate(e.target.value)} />
      </div>
      <div style={{marginTop:14,fontSize:'.8rem',lineHeight:1.4}}>
        Subtotale: €{totals.subtotal.toFixed(2)}<br />
        IVA: €{totals.vat.toFixed(2)}<br />
        <strong>Totale: €{totals.total.toFixed(2)}</strong>
      </div>
      {error && <div style={{color:'red',fontSize:'.7rem',marginTop:6}}>{error}</div>}
      <div style={{marginTop:14}}>
        <button className="btn" onClick={download}>Scarica PDF</button>
      </div>
    </div>
  );
}

window.QuoteTool = QuoteTool;
