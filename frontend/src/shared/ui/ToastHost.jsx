/* global React */
// Simple toast system (non-hook dependency-free) for quick integration.
export function createToastStore(){
  let subs = new Set();
  let toasts = [];
  function emit(){ subs.forEach(s=>s(toasts)); }
  function push(msg, opts={}){
    const id = Math.random().toString(36).slice(2);
    const t = { id, msg, type:opts.type||'info', timeout: opts.timeout==null? 3800: opts.timeout };
    toasts = [...toasts, t];
    emit();
    if(t.timeout>0){ setTimeout(()=> remove(id), t.timeout); }
    return id;
  }
  function remove(id){ toasts = toasts.filter(t=>t.id!==id); emit(); }
  function clear(){ toasts=[]; emit(); }
  function subscribe(fn){ subs.add(fn); fn(toasts); return ()=>subs.delete(fn); }
  return { push, remove, clear, subscribe };
}

export const toastStore = createToastStore();

export function useToasts(){
  const [list,setList] = React.useState([]);
  React.useEffect(()=> toastStore.subscribe(setList),[]);
  return {
    toasts:list,
    push: toastStore.push,
    remove: toastStore.remove,
    clear: toastStore.clear
  };
}

export function ToastHost(){
  const { toasts, remove } = useToasts();
  return <div style={{ position:'fixed', zIndex:120, top:10, right:10, display:'flex', flexDirection:'column', gap:8, maxWidth:340 }}>
    {toasts.map(t=> <div key={t.id} onClick={()=>remove(t.id)} style={{cursor:'pointer', padding:'10px 14px', borderRadius:10, fontSize:'.7rem', lineHeight:1.3, background: bgFor(t.type), color:'#fff', boxShadow:'0 4px 12px -2px rgba(0,0,0,.3)', display:'flex', alignItems:'center', gap:10 }}>
      <span style={{fontWeight:600}}>{iconFor(t.type)}</span>
      <span style={{flex:1}}>{t.msg}</span>
    </div>)}
  </div>;
}

// Global exposure so non-bundled code (tool pages) can mount or push toasts
if(typeof window!=='undefined'){
  window.ToolHubToastHost = ToastHost;
  window.ToolHubToast = function(msg,type='info',opts){ return toastStore.push(msg,{...opts,type}); };
  window.ToolHubToasts = toastStore;
}

function bgFor(type){
  switch(type){
    case 'success': return 'linear-gradient(135deg,#16a34a,#15803d)';
    case 'error': return 'linear-gradient(135deg,#dc2626,#b91c1c)';
    case 'warn': return 'linear-gradient(135deg,#ca8a04,#a16207)';
    default: return 'linear-gradient(135deg,#6366f1,#4f46e5)';
  }
}
function iconFor(type){
  switch(type){
    case 'success': return '✓';
    case 'error': return '⨯';
    case 'warn': return '⚠';
    default: return 'ℹ';
  }
}
