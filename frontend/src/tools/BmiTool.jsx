/* global React */
import { currencyFormat, numberFormat } from '../shared/format.js'; // (not strictly needed now, placeholder for consistency)
import { track } from '../shared/api.js';

export function BmiTool(){
  const [height,setHeight] = React.useState('');
  const [weight,setWeight] = React.useState('');
  const [result,setResult] = React.useState(null);
  const [error,setError] = React.useState('');
  const [history,setHistory] = React.useState([]); // { ts, bmi, cat }
  const [showTable,setShowTable] = React.useState(false);

  function classify(b){ if(b<16) return 'Grave sottopeso'; if(b<18.5) return 'Sottopeso'; if(b<25) return 'Normopeso'; if(b<30) return 'Sovrappeso'; if(b<35) return 'Obesità I'; if(b<40) return 'Obesità II'; return 'Obesità III'; }

  function validate(){
    const h = parseFloat(height); const w = parseFloat(weight);
    if(isNaN(h) || isNaN(w)) return 'Inserisci valori numerici';
    if(h<80 || h>250) return 'Altezza fuori range (80-250 cm)';
    if(w<20 || w>300) return 'Peso fuori range (20-300 kg)';
    return null;
  }

  function calc(){
    setError(''); setResult(null);
    const vErr = validate();
    if(vErr){ setError(vErr); window.ToolHubToast?.(vErr,'warn'); return; }
    const hM = parseFloat(height)/100; const wKg = parseFloat(weight);
    const bmiRaw = wKg / (hM*hM);
    const bmi = Number(bmiRaw.toFixed(1));
    const cat = classify(bmiRaw);
    const minW = (18.5 * hM*hM).toFixed(1);
    const maxW = (24.9 * hM*hM).toFixed(1);
    const msg = `IMC: ${bmi} (${cat}). Range salutare: ${minW}-${maxW} kg`;
    setResult({ bmi, cat, minW, maxW, msg });
    setHistory(h=> [{ ts:Date.now(), bmi, cat }, ...h].slice(0,15));
    track('bmi_calc',{ bmi, cat });
    window.ToolHubToast?.('Calcolo completato','success');
  }

  const catColor = (cat)=>{
    if(!cat) return '#64748b';
    if(/Normo/i.test(cat)) return '#16a34a';
    if(/Sovra|Obes|Grave/i.test(cat)) return '#dc2626';
    if(/Sotto/i.test(cat)) return '#ca8a04';
    return '#64748b';
  };

  return <div className="card" style={{display:'flex',flexDirection:'column',gap:14}}>
    <h3 style={{margin:0}}>Calcolatore IMC</h3>
    <p style={{fontSize:12,margin:'0 0 4px',opacity:.7}}>Inserisci altezza e peso per ottenere BMI, classificazione e range salutare. I dati restano sul dispositivo.</p>
    <div style={{display:'grid',gap:10}}>
      <div>
        <label style={{fontSize:11,opacity:.75,display:'block',marginBottom:4}}>Altezza (cm)</label>
        <input inputMode="decimal" placeholder="es. 175" value={height} onChange={e=>setHeight(e.target.value)} />
      </div>
      <div>
        <label style={{fontSize:11,opacity:.75,display:'block',marginBottom:4}}>Peso (kg)</label>
        <input inputMode="decimal" placeholder="es. 70" value={weight} onChange={e=>setWeight(e.target.value)} />
      </div>
      <div><button className="btn" type="button" onClick={calc}>Calcola</button></div>
      {error && <div style={{color:'#dc2626',fontSize:12}}>{error}</div>}
      {result && <div style={{fontSize:13,lineHeight:1.4}}>
        <div style={{fontWeight:600,color:catColor(result.cat)}}>{result.msg}</div>
      </div>}
    </div>
    <details style={{marginTop:4}} open={false}>
      <summary style={{fontSize:11,opacity:.7,cursor:'pointer'}}>Classificazione BMI (WHO)</summary>
      <table style={{marginTop:8,fontSize:11}}>
        <thead><tr><th>Categoria</th><th>Intervallo</th></tr></thead>
        <tbody>
          <tr><td>Sottopeso severo</td><td>&lt; 16</td></tr>
          <tr><td>Sottopeso</td><td>16 - 18.49</td></tr>
          <tr><td>Normopeso</td><td>18.5 - 24.99</td></tr>
          <tr><td>Sovrappeso</td><td>25 - 29.99</td></tr>
          <tr><td>Obesità I</td><td>30 - 34.99</td></tr>
          <tr><td>Obesità II</td><td>35 - 39.99</td></tr>
          <tr><td>Obesità III</td><td>≥ 40</td></tr>
        </tbody>
      </table>
    </details>
    {history.length>0 && <div style={{marginTop:4}}>
      <details>
        <summary style={{fontSize:11,opacity:.7,cursor:'pointer'}}>Cronologia (ultimi {history.length})</summary>
        <div style={{marginTop:8,display:'grid',gap:4,fontSize:11}}>
          {history.map(h=> <div key={h.ts} style={{display:'flex',justifyContent:'space-between'}}><span>{new Date(h.ts).toLocaleTimeString()}</span><span style={{color:catColor(h.cat)}}>{h.bmi} ({h.cat})</span></div>)}
        </div>
      </details>
    </div>}
  </div>;
}

export default BmiTool;
