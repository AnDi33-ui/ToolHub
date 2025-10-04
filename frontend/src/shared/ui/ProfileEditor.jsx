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
  const [fieldErrors,setFieldErrors] = React.useState({});

  function validate(next){
    const f = next || form;
    const errs={};
    // Ragione sociale opzionale: se presente min 2
    if(f.ragione_sociale && f.ragione_sociale.trim().length<2) errs.ragione_sociale='Troppo corta';
    // P.IVA: se valorizzata deve essere 11 cifre
    if(f.piva){
      const pv = f.piva.replace(/\s+/g,'');
      if(!/^\d{11}$/.test(pv)) errs.piva='P.IVA deve avere 11 cifre';
    }
    // Codice Fiscale: se valorizzato 16 alfanum (non validiamo algoritmo completo)
    if(f.codice_fiscale){
      const cf = f.codice_fiscale.trim().toUpperCase();
      if(!/^[A-Z0-9]{16}$/.test(cf)) errs.codice_fiscale='CF deve essere 16 caratteri alfanumerici';
    }
    // Provincia: se valorizzata 2 lettere
    if(f.provincia){
      const pr = f.provincia.trim().toUpperCase();
      if(!/^[A-Z]{2}$/.test(pr)) errs.provincia='2 lettere';
    }
    // CAP: se valorizzato 5 cifre
    if(f.cap){
      if(!/^\d{5}$/.test(f.cap)) errs.cap='CAP 5 cifre';
    }
    // Aliquota IVA range 0-100
    if(f.aliquota_iva_default!=='' && (isNaN(f.aliquota_iva_default) || f.aliquota_iva_default<0 || f.aliquota_iva_default>100)) errs.aliquota_iva_default='0-100';
    setFieldErrors(errs);
    return errs;
  }

  function update(field,val){
    setForm(f=>{
      let v=val;
      if(field==='codice_fiscale') v=val.toUpperCase();
      if(field==='provincia') v=val.toUpperCase();
      const next={...f,[field]:v};
      validate(next);
      return next;
    });
    setSaved(false);
  }

  React.useEffect(()=>{ validate(form); /* initial */ },[]);

  async function save(){
    const errs = validate();
    if(Object.keys(errs).length){ setError('Correggi i campi evidenziati'); return; }
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
          <div>
            <input placeholder="Ragione Sociale" value={form.ragione_sociale} onChange={e=>update('ragione_sociale',e.target.value)} style={fieldErrors.ragione_sociale? invalidStyle:null} />
            {fieldErrors.ragione_sociale && <small style={errStyle}>{fieldErrors.ragione_sociale}</small>}
          </div>
          <textarea rows={2} placeholder="Indirizzo" value={form.indirizzo} onChange={e=>update('indirizzo',e.target.value)} />
          <div style={twoColsStyle}>
            <div>
              <input placeholder="CAP" value={form.cap||''} onChange={e=>update('cap',e.target.value)} style={fieldErrors.cap? invalidStyle:null} />
              {fieldErrors.cap && <small style={errStyle}>{fieldErrors.cap}</small>}
            </div>
            <input placeholder="Città" value={form.citta||''} onChange={e=>update('citta',e.target.value)} />
          </div>
          <div style={twoColsStyle}>
            <div>
              <input placeholder="Provincia" value={form.provincia||''} onChange={e=>update('provincia',e.target.value)} style={fieldErrors.provincia? invalidStyle:null} maxLength={2} />
              {fieldErrors.provincia && <small style={errStyle}>{fieldErrors.provincia}</small>}
            </div>
            <input placeholder="Nazione" value={form.nazione||''} onChange={e=>update('nazione',e.target.value)} />
          </div>
          <div style={twoColsStyle}>
            <div>
              <input placeholder="P. IVA" value={form.piva} onChange={e=>update('piva',e.target.value)} style={fieldErrors.piva? invalidStyle:null} />
              {fieldErrors.piva && <small style={errStyle}>{fieldErrors.piva}</small>}
            </div>
            <div>
              <input placeholder="Codice Fiscale" value={form.codice_fiscale} onChange={e=>update('codice_fiscale',e.target.value)} style={fieldErrors.codice_fiscale? invalidStyle:null} maxLength={16} />
              {fieldErrors.codice_fiscale && <small style={errStyle}>{fieldErrors.codice_fiscale}</small>}
            </div>
          </div>
          <div style={twoColsStyle}>
            <select value={form.regime_fiscale} onChange={e=>update('regime_fiscale',e.target.value)}>
              <option value="forfettario">Forfettario</option>
              <option value="ordinario">Ordinario</option>
              <option value="flat">Flat (demo)</option>
            </select>
            <div>
              <input type="number" min={0} max={100} placeholder="Aliquota IVA %" value={form.aliquota_iva_default} onChange={e=>update('aliquota_iva_default',e.target.value)} style={fieldErrors.aliquota_iva_default? invalidStyle:null} />
              {fieldErrors.aliquota_iva_default && <small style={errStyle}>{fieldErrors.aliquota_iva_default}</small>}
            </div>
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
            <button className="btn" type="button" disabled={saving || Object.keys(fieldErrors).length>0} onClick={save}>{saving? 'Salvataggio...' : 'Salva'}</button>
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
const invalidStyle={border:'1px solid #dc2626',background:'#fff8f8'};
const errStyle={display:'block',color:'#dc2626',fontSize:10,marginTop:2};

export default ProfileEditor;
