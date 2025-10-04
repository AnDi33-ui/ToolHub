/* global React */
import { apiFetch } from '../api.js';

// Hook centralizzato per caricare e salvare il profilo business
// Restituisce: { profile, setProfile, loading, error, refresh, saveProfile }
export function useBusinessProfile(enabled = true){
  const [profile,setProfile] = React.useState(null);
  const [loading,setLoading] = React.useState(false);
  const [error,setError] = React.useState('');

  const refresh = React.useCallback(async ()=>{
    if(!enabled) return;
    setLoading(true); setError('');
    try {
      const j = await apiFetch('/api/profile');
      if(j.ok){ setProfile(j.profile); }
      else { setError(j.error||'Errore caricamento profilo'); }
    } catch(e){ setError(e.message||'Errore rete'); }
    finally { setLoading(false); }
  },[enabled]);

  React.useEffect(()=>{ if(enabled) refresh(); },[enabled, refresh]);

  async function saveProfile(patch){
    try {
      const j = await apiFetch('/api/profile',{ method:'PUT', body:patch });
      if(j.ok){ setProfile(j.profile); return { ok:true, profile:j.profile }; }
      return { ok:false, error:j.error||'Errore salvataggio' };
    } catch(e){ return { ok:false, error:e.message||'Errore rete' }; }
  }

  return { profile, setProfile, loading, error, refresh, saveProfile };
}

export default useBusinessProfile;
