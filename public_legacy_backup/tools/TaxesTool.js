function TaxesTool(){
  const [income, setIncome] = React.useState('');
  const [regime, setRegime] = React.useState('forfettario');
  const [result, setResult] = React.useState(null);

  function compute(inc){
    if(regime==='forfettario'){
      const coeff = 0.78; // redditività
      const taxable = inc * coeff;
      const imposta = taxable * 0.15; // imposta sostitutiva
      const contributi = inc * 0.25; // gestione separata ipotetica
      const net = inc - imposta - contributi;
      return { imposta, contributi, net, note:'Aliquota 15% su base forfettaria (coeff 78%)' };
    }
    if(regime==='ordinario'){
      // Semplificato: scaglioni
      let remaining = inc; let imposta=0;
      const bands = [ [15000,0.23],[13000,0.25],[27000,0.35],[30000,0.43] ];
      for(const [amount,rate] of bands){
        const applied = Math.min(remaining, amount); if(applied<=0) break; imposta += applied*rate; remaining -= applied; }
      if(remaining>0) imposta += remaining*0.45; // extra
      const contributi = inc * 0.27;
      const net = inc - imposta - contributi;
      return { imposta, contributi, net, note:'Scaglioni IRPEF semplificati demo + contributi 27%' };
    }
    if(regime==='flat'){ // ipotetico freelance internazionale
      const imposta = inc * 0.25; const contributi = inc * 0.05; const net = inc - imposta - contributi;
      return { imposta, contributi, net, note:'Flat tax demo 25% + 5% social' };
    }
    return { imposta:0, contributi:0, net:inc, note:'N/A' };
  }

  function estimate(){
    const inc = parseFloat(income);
    if(isNaN(inc)) return setResult('Inserire valore numerico');
    const { imposta, contributi, net, note } = compute(inc);
    setResult(`Imposta: €${imposta.toFixed(2)} | Contributi: €${contributi.toFixed(2)} | Netto: €${net.toFixed(2)}\n${note}`);
  }

  return (
    <div className="card">
      <h3>Calcolatore tasse freelance</h3>
      <p style={{fontSize:12,opacity:.7,margin:'4px 0 10px'}}>Stima indicativa non sostitutiva di consulenza fiscale. Inserisci il reddito lordo annuale e scegli il regime.</p>
      <input placeholder="Reddito annuo (€)" value={income} onChange={e=>setIncome(e.target.value)} />
      <select value={regime} onChange={e=>setRegime(e.target.value)} style={{marginTop:8}}>
        <option value="forfettario">Regime Forfettario</option>
        <option value="ordinario">Regime Ordinario</option>
        <option value="flat">Flat Tax (demo)</option>
      </select>
      <div style={{marginTop:8}}>
        <button className="btn" onClick={estimate}>Stima</button>
      </div>
      <div style={{marginTop:8,whiteSpace:'pre-wrap'}}>{result}</div>
      <details style={{marginTop:10}}>
        <summary style={{cursor:'pointer',fontSize:12,opacity:.7}}>Assunzioni semplificate usate</summary>
        <ul style={{margin:'8px 0 0',paddingLeft:18,fontSize:12,lineHeight:1.4}}>
          <li>Forfettario: coefficiente redditività 78%, imposta sostitutiva 15%, contributi 25% (indicativo)</li>
          <li>Ordinario: scaglioni demo e contributi 27% flat</li>
          <li>Flat Tax demo: 25% imposta + 5% contributi (caso internazionale ipotetico)</li>
        </ul>
      </details>
    </div>
  );
}

window.TaxesTool = TaxesTool;
