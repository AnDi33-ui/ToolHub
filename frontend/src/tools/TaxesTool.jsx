/* global React */
import { currencyFormat, percentFormat } from '../shared/format';
import { track } from '../shared/api';
import ProfileEditor from '../shared/ui/ProfileEditor.jsx';

/* TaxesTool React version
   Enhancements:
   - Validation & numeric parsing
   - Detailed breakdown table
   - Scenario compare (forfettario vs ordinario vs flat) simultaneously
   - Toast notifications
*/

function compute(regime, inc){
  if(regime==='forfettario'){
    const coeff=0.78; const taxable=inc*coeff; const imposta=taxable*0.15; const contributi=inc*0.25; const net=inc-imposta-contributi; return { regime, imposta, contributi, net, note:'Aliquota 15% coeff 78% + contributi 25%' };
  }
  if(regime==='ordinario'){
    let remaining=inc; let imposta=0; const bands=[[15000,0.23],[13000,0.25],[27000,0.35],[30000,0.43]]; for(const [amount,rate] of bands){ const applied=Math.min(remaining,amount); if(applied<=0) break; imposta+=applied*rate; remaining-=applied; } if(remaining>0) imposta+=remaining*0.45; const contributi=inc*0.27; const net=inc-imposta-contributi; return { regime, imposta, contributi, net, note:'Scaglioni semplificati + 27% contributi' };
  }
  if(regime==='flat'){
    const imposta=inc*0.25; const contributi=inc*0.05; const net=inc-imposta-contributi; return { regime, imposta, contributi, net, note:'Flat 25% + Social 5%' };
  }
  return { regime, imposta:0, contributi:0, net:inc, note:'N/A' };
}

const REGIMES=['forfettario','ordinario','flat'];

export default function TaxesTool(){
  const { useState, useEffect } = React;
  const [income,setIncome] = useState('');
  const [focusRegime,setFocusRegime] = useState('forfettario');
  const [results,setResults] = useState(null);
  const [msg,setMsg] = useState('');
  const [profile,setProfile] = useState(null);
  const [profileEditorOpen,setProfileEditorOpen] = useState(false);

  function toast(t){ if(window.ToolHubToast){ window.ToolHubToast(t); } else setMsg(t); }

  function estimate(){ const inc=parseFloat(income.replace(/,/g,'.')); if(isNaN(inc) || inc<=0){ toast('Inserisci reddito valido'); return; } const res=REGIMES.map(r=>compute(r,inc)); setResults(res); track('taxes_estimate',{ income:inc }); toast('Stima aggiornata'); }

  function bestNet(){ if(!results) return null; return results.reduce((a,b)=> b.net>a.net? b:a, results[0]).regime; }
  const highlight = bestNet();

  useEffect(()=>{ track('taxes_tool_open'); },[]);
  useEffect(()=>{ // load profile to prefill regime or future defaults
    fetch('/api/profile', { credentials:'include'}).then(r=>r.json()).then(j=>{ if(j.ok && j.profile){ setProfile(j.profile); if(j.profile.regime_fiscale) setFocusRegime(j.profile.regime_fiscale); } }).catch(()=>{});
  },[]);

  return (
    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h3 style={{margin:0}}>Calcolatore tasse freelance</h3>
        <button className="btn secondary" style={{fontSize:'.55rem'}} onClick={()=>setProfileEditorOpen(true)}>Profilo</button>
      </div>
      <p style={{fontSize:12,opacity:.7,margin:'4px 0 10px'}}>Stima indicativa. Confronta rapidamente regimi diversi.</p>
      <div style={{display:'grid',gap:8}}>
        <input placeholder="Reddito annuo (€)" value={income} onChange={e=>setIncome(e.target.value)} />
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {REGIMES.map(r=> <button key={r} type="button" className={'btn '+(focusRegime===r?'':'secondary')} onClick={()=>setFocusRegime(r)}>{r}</button>)}
        </div>
        <div>
          <button className="btn" type="button" onClick={estimate}>Stima</button>
        </div>
      </div>
      {results && (
        <div style={{marginTop:16}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{textAlign:'left'}}>
                <th style={{padding:'4px 6px',borderBottom:'1px solid var(--border)'}}>Regime</th>
                <th style={{padding:'4px 6px',borderBottom:'1px solid var(--border)'}}>Imposta</th>
                <th style={{padding:'4px 6px',borderBottom:'1px solid var(--border)'}}>Contributi</th>
                <th style={{padding:'4px 6px',borderBottom:'1px solid var(--border)'}}>Netto</th>
                <th style={{padding:'4px 6px',borderBottom:'1px solid var(--border)'}}>Note</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r=> (
                <tr key={r.regime} style={{background: r.regime===highlight? 'var(--bg-alt)':'transparent'}}>
                  <td style={{padding:'4px 6px',fontWeight:r.regime===focusRegime?'600':'400'}}>{r.regime}</td>
                  <td style={{padding:'4px 6px'}}>{currencyFormat(r.imposta)}</td>
                  <td style={{padding:'4px 6px'}}>{currencyFormat(r.contributi)}</td>
                  <td style={{padding:'4px 6px',fontWeight:r.regime===highlight?'600':'400'}}>{currencyFormat(r.net)}</td>
                  <td style={{padding:'4px 6px',fontSize:10,opacity:.7}}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{marginTop:10,fontSize:11,opacity:.65}}>Miglior netto: {highlight}</div>
        </div>
      )}
      <details style={{marginTop:14}}>
        <summary style={{cursor:'pointer',fontSize:12,opacity:.7}}>Assunzioni semplificate</summary>
        <ul style={{margin:'8px 0 0',paddingLeft:18,fontSize:12,lineHeight:1.4}}>
          <li>Forfettario: coeff 78%, imposta 15%, contributi 25%</li>
          <li>Ordinario: scaglioni demo, contributi 27%</li>
          <li>Flat: imposta 25%, contributi 5%</li>
        </ul>
      </details>
      <div style={{marginTop:8,fontSize:10,color:'#64748b'}}>{msg}</div>
      {profileEditorOpen && <ProfileEditor profile={profile} onClose={()=>setProfileEditorOpen(false)} onSaved={(p)=>{ setProfile(p); setProfileEditorOpen(false); if(p?.regime_fiscale) setFocusRegime(p.regime_fiscale); window.ToolHubToast?.('Profilo aggiornato','success'); }} />}
    </div>
  );
}

if(typeof window!== 'undefined'){
  window.TaxesTool = TaxesTool;
}
