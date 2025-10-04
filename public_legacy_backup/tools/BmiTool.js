function BmiTool(){
  const [height, setHeight] = React.useState('');
  const [weight, setWeight] = React.useState('');
  const [result, setResult] = React.useState(null);

  function classify(b){
    if(b<18.5) return 'Sottopeso';
    if(b<25) return 'Normopeso';
    if(b<30) return 'Sovrappeso';
    return 'Obesità';
  }
  function calc(){
    const h = parseFloat(height)/100;
    const w = parseFloat(weight);
    if(!h || !w) return setResult('Inserire valori validi');
    const bmiRaw = w / (h*h);
    const bmi = bmiRaw.toFixed(1);
    const cat = classify(bmiRaw);
    const minW = (18.5 * h*h).toFixed(1);
    const maxW = (24.9 * h*h).toFixed(1);
    setResult(`IMC: ${bmi} (${cat}). Peso salutare stimato: ${minW}-${maxW} kg`);
  }

  return (
    <div className="card">
      <h3>Calcolatore IMC</h3>
      <p style={{fontSize:12,opacity:.7,margin:'4px 0 10px'}}>Inserisci altezza e peso per ottenere BMI, classificazione e range salutare. I dati restano sul tuo dispositivo.</p>
      <div style={{display:'grid',gap:10}}>
        <div>
          <label style={{fontSize:11,opacity:.7,display:'block',marginBottom:4}}>Altezza (cm)</label>
          <input inputMode="decimal" placeholder="es. 175" value={height} onChange={e=>setHeight(e.target.value)} />
        </div>
        <div>
          <label style={{fontSize:11,opacity:.7,display:'block',marginBottom:4}}>Peso (kg)</label>
          <input inputMode="decimal" placeholder="es. 70" value={weight} onChange={e=>setWeight(e.target.value)} />
        </div>
        <div>
          <button className="btn" type="button" onClick={calc}>Calcola</button>
        </div>
      </div>
      <div style={{marginTop:8}}>{result}</div>
    </div>
  );
}

window.BmiTool = BmiTool;
