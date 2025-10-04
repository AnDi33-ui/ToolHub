/* global React */
import { apiFetch } from '../../shared/api.js';

/** ProfileEditor
 * Semplice pannello/modale per modificare il profilo business.
 * Props:
 *  - profile: oggetto profilo corrente (può essere null)
 *  - onClose(): chiude editor
 *  - onSaved(profile): callback dopo salvataggio riuscito
 */
export function ProfileEditor({ profile, onClose, onSaved }){
  const [form,setForm] = React.useState(()=>({
    ragione_sociale: profile?.ragione_sociale || '',
    indirizzo: profile?.indirizzo || '',
    piva: profile?.piva || '',
    codice_fiscale: profile?.codice_fiscale || '',
    regime_fiscale: profile?.regime_fiscale || 'forfettario',
    aliquota_iva_default: profile?.aliquota_iva_default ?? 22,
    currency_default: profile?.currency_default || 'EUR',
    note_footer_default: profile?.note_footer_default || ''
  }));
  const [saving,setSaving] = React.useState(false);
  const [error,setError] = React.useState('');
  const [saved,setSaved] = React.useState(false);

  function update(field,val){ setForm(f=>({...f,[field]:val})); setSaved(false); }

  async function save(){
    setSaving(true); setError('');
    try {
      const payload = { ...form };
      // Normalizzazioni minori
      if(!payload.piva) delete payload.piva;
      if(!payload.codice_fiscale) delete payload.codice_fiscale;
      const res = await apiFetch('/api/profile',{ method:'PUT', body: payload });
      if(res.ok){ setSaved(true); onSaved && onSaved(res.profile); }
      else setError(res.error||'Errore salvataggio');
    } catch(e){ setError(e.message||'Errore rete'); }
    finally { setSaving(false); }
  }

  return (
    <div style={overlayStyle}>
      <div style={panelStyle} className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <h3 style={{margin:0,fontSize:'0.9rem'}}>Profilo azienda</h3>
          <button className="btn secondary" style={{fontSize:'.6rem'}} onClick={onClose}>Chiudi</button>
        </div>
        <div style={{display:'grid',gap:8,maxHeight:'70vh',overflow:'auto',paddingRight:4}}>
          <input placeholder="Ragione Sociale" value={form.ragione_sociale} onChange={e=>update('ragione_sociale',e.target.value)} />
          <textarea rows={2} placeholder="Indirizzo" value={form.indirizzo} onChange={e=>update('indirizzo',e.target.value)} />
          <div style={twoColsStyle}>
            <input placeholder="CAP" value={form.cap||''} onChange={e=>update('cap',e.target.value)} />
            <input placeholder="Città" value={form.citta||''} onChange={e=>update('citta',e.target.value)} />
          </div>
          <div style={twoColsStyle}>
            <input placeholder="Provincia" value={form.provincia||''} onChange={e=>update('provincia',e.target.value)} />
            <input placeholder="Nazione" value={form.nazione||''} onChange={e=>update('nazione',e.target.value)} />
          </div>
          <div style={twoColsStyle}>
            <input placeholder="P. IVA" value={form.piva} onChange={e=>update('piva',e.target.value)} />
            <input placeholder="Codice Fiscale" value={form.codice_fiscale} onChange={e=>update('codice_fiscale',e.target.value)} />
          </div>
          <div style={twoColsStyle}>
            <select value={form.regime_fiscale} onChange={e=>update('regime_fiscale',e.target.value)}>
              <option value="forfettario">Forfettario</option>
              <option value="ordinario">Ordinario</option>
              <option value="flat">Flat (demo)</option>
            </select>
            <input type="number" min={0} max={100} placeholder="Aliquota IVA %" value={form.aliquota_iva_default} onChange={e=>update('aliquota_iva_default',e.target.value)} />
          </div>
          <div style={twoColsStyle}>
            <select value={form.currency_default} onChange={e=>update('currency_default',e.target.value)}>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
            </select>
            <input placeholder="Nota footer (breve)" value={form.note_footer_default} onChange={e=>update('note_footer_default',e.target.value)} />
          </div>
          {error && <div style={{color:'red',fontSize:12}}>{error}</div>}
          {saved && !error && <div style={{color:'#16a34a',fontSize:12}}>Salvato ✔</div>}
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button className="btn" type="button" disabled={saving} onClick={save}>{saving? 'Salvataggio...' : 'Salva'}</button>
            <button className="btn secondary" type="button" onClick={()=>{ onClose(); }}>Chiudi</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const overlayStyle={position:'fixed',inset:0,background:'rgba(0,0,0,.35)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200};
const panelStyle={width:'min(600px,92%)',maxWidth:600,padding:18,borderRadius:14,boxShadow:'0 10px 28px -4px rgba(0,0,0,.3)'};
const twoColsStyle={display:'grid',gap:8,gridTemplateColumns:'1fr 1fr'};

export default ProfileEditor;
