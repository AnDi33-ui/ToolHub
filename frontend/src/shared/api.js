/* Shared API utilities */
/* global fetch */

const API_BASE = (function(){
  if(typeof window!== 'undefined' && window.API_BASE) return window.API_BASE.replace(/\/$/,'');
  if(typeof location!=='undefined' && location.port==='5173') return 'http://localhost:3000';
  return '';
})();

export class ApiError extends Error {
  constructor(message, status, code){
    super(message); this.status=status; this.code=code || 'ERR';
  }
}

export async function apiFetch(path, { method='GET', headers={}, body, json=true, retry= method==='GET'? 1:0, auth=true } = {}){
  const url = API_BASE + path;
  const finalHeaders = { ...headers };
  let finalBody = body;
  if(body && typeof body === 'object' && !(body instanceof FormData)){
    finalHeaders['Content-Type'] = finalHeaders['Content-Type'] || 'application/json';
    if(finalHeaders['Content-Type'].includes('application/json')) finalBody = JSON.stringify(body);
  }
  // Legacy token upgrade header (only if no cookie session yet) - optional
  if(auth){
    try{ if(!document.cookie.includes('sid=') && localStorage.getItem('sessionToken')) finalHeaders['x-session-token'] = localStorage.getItem('sessionToken'); }catch(_){ }
  }
  let attempt=0; let lastErr;
  while(true){
    try {
      const res = await fetch(url,{ method, headers:finalHeaders, body:finalBody, credentials:'include' });
      const isJson = (res.headers.get('content-type')||'').includes('application/json');
      const data = json && isJson ? await res.json() : (json? {}: await res.text());
      if(!res.ok){
        // 401 handling: surface a recognizable error for caller to trigger login UI
        if(res.status===401){
          try {
            if(typeof window!== 'undefined' && window.dispatchEvent){
              window.dispatchEvent(new CustomEvent('toolhub:unauthorized',{ detail:{ path, status:401, ts:Date.now() }}));
            }
          } catch(_){ }
          throw new ApiError(data.error || 'Non autenticato', 401, 'UNAUTH'); }
        throw new ApiError(data.error || ('HTTP '+res.status), res.status);
      }
      return data;
    } catch(err){
      lastErr = err;
      if(attempt < retry){ attempt++; await new Promise(r=>setTimeout(r, 160 * attempt)); continue; }
      throw lastErr;
    }
  }
}

export function buildQuery(params){
  const usp = new URLSearchParams();
  Object.entries(params||{}).forEach(([k,v])=>{ if(v==null) return; usp.set(k,String(v)); });
  const str = usp.toString();
  return str? ('?'+str): '';
}

export function track(event, meta){
  try {
    const payload = { event, meta: meta||{}, ts: Date.now() };
    (track.queue = track.queue || []).push(payload);
    if(track.queue.length >= 10){ flushTrack(); }
  }catch(_){ }
}

export async function flushTrack(){
  if(!track.queue || !track.queue.length) return;
  const batch = track.queue.splice(0, track.queue.length);
  try { await fetch(API_BASE + '/api/usage/bulk',{ method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ events: batch }) }); }catch(_){ /* ignore */ }
}

if(typeof window!=='undefined'){
  window.addEventListener('beforeunload', ()=>{ try { flushTrack(); }catch(_){ } });
}
