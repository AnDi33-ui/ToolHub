/* global React */
import { track } from '../shared/api';
import { currencyFormat } from '../shared/format'; // (not used now, placeholder for potential cost metrics)

/* FlashcardTool (React migration)
   Features:
   - CRUD cards with front/back fields
   - JSON import/export
   - PDF export (server side)
   - Study mode with spaced repetition style queue (failed cards appended)
   - Undo last mark (known/again)
   - Session stats: accuracy %, elapsed time, known/remaining
   - LocalStorage persistence (cards + in-progress session)
   - Toast notifications (if ToastHost present) via window.ToolHubToast
*/

const LS_KEY = 'toolhub.flashcards.v1';
const LS_SESSION_KEY = 'toolhub.flashcards.session.v1';

function usePersistedState(key, initial) {
  const [val, setVal] = useState(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* ignore */ } }, [val, key]);
  return [val, setVal];
}

function percent(n, d) { if (!d) return '0%'; return ((n / d) * 100).toFixed(0) + '%'; }

export default function FlashcardTool(){
  const { useState, useEffect, useRef } = React;
  const API_BASE = (window.API_BASE || (location.port==='5173'?'http://localhost:3000':'')).replace(/\/$/, '');
  const [cards,setCards] = usePersistedState(LS_KEY, [{front:'Q1',back:'A1'}]);
  const [syncJson,setSyncJson] = useState('');
  const [msg,setMsg] = useState('');

  // Study state
  const [isStudy,setIsStudy] = useState(false);
  const [queue,setQueue] = useState([]); // array of indexes
  const [cursor,setCursor] = useState(0);
  const [showBack,setShowBack] = useState(false);
  const [known,setKnown] = useState(0);
  const [wrong,setWrong] = useState(0);
  const [total,setTotal] = useState(0);
  const [startTime,setStartTime] = useState(null);
  const lastActionRef = useRef(null); // {type:'known'|'again', index:number}

  // Persist session
  useEffect(()=>{
    if(isStudy){
      const session = { queue, cursor, known, wrong, total, startTime, timestamp: Date.now(), originalLength: cards.length };
      try { localStorage.setItem(LS_SESSION_KEY, JSON.stringify(session)); } catch {}
    } else {
      try { localStorage.removeItem(LS_SESSION_KEY); } catch {}
    }
  }, [isStudy, queue, cursor, known, wrong, total, startTime, cards.length]);

  // Load sync JSON when cards change
  useEffect(()=>{ setSyncJson(JSON.stringify(cards,null,2)); },[cards]);

  function addCard(){ setCards(prev=>[...prev,{front:'',back:''}]); }
  function update(i,field,val){ setCards(prev=> prev.map((c,idx)=> idx===i? {...c,[field]:val}:c)); }
  function remove(i){ setCards(prev=> prev.filter((_,idx)=> idx!==i)); }

  function importJson(){ try { const parsed = JSON.parse(syncJson); if(Array.isArray(parsed)) { setCards(parsed.filter(c=>c && typeof c==='object' && 'front' in c && 'back' in c)); toast('Import eseguito'); track('flashcards_import',{count:parsed.length}); } else setMsg('JSON non valido (array)'); } catch(err){ setMsg('Errore parse JSON: '+err.message); } }
  function exportJSON(){ const blob = new Blob([JSON.stringify(cards,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='flashcards.json'; a.click(); URL.revokeObjectURL(url); track('flashcards_export_json',{count:cards.length}); toast('JSON esportato'); }
  async function exportPDF(){ toast('Generazione PDF...'); try{ const r = await fetch(API_BASE + '/api/export/flashcards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cards})}); if(!r.ok){ let j={}; try{ j=await r.json(); }catch{} toast('Errore: '+(j.error||r.status)); return; } const blob = await r.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='flashcards.pdf'; a.click(); URL.revokeObjectURL(url); toast('PDF pronto'); track('flashcards_export_pdf',{count:cards.length}); }catch(err){ toast('Errore rete: '+err.message); } }

  function shuffleArray(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } }
  function startStudy(shuffle=true){ if(!cards.length){ toast('Aggiungi almeno una card'); return; } const idxs = cards.map((_,i)=>i); if(shuffle) shuffleArray(idxs); setQueue(idxs); setCursor(0); setShowBack(false); setKnown(0); setWrong(0); setTotal(idxs.length); setIsStudy(true); setStartTime(Date.now()); track('flashcards_start',{count:idxs.length, shuffle}); }
  function exitStudy(){ setIsStudy(false); toast('Sessione terminata'); track('flashcards_exit',{known, wrong, total}); }

  const currentIndex = queue[cursor];
  const currentCard = currentIndex!=null ? cards[currentIndex] : null;
  function flip(){ setShowBack(s=>!s); }

  function mark(know){ if(currentIndex==null) return; setQueue(q=>{ const clone=[...q]; const idxVal = clone[cursor]; clone.splice(cursor,1); if(!know){ clone.push(idxVal); setWrong(w=>w+1); lastActionRef.current={type:'again',index:idxVal}; } else { setKnown(k=>k+1); lastActionRef.current={type:'known',index:idxVal}; }
      return clone; }); setShowBack(false); setTimeout(()=>{ setCursor(c=>0); },0); }

  function undo(){ const last = lastActionRef.current; if(!last){ toast('Nessuna azione da annullare'); return; } // Simplified undo: reinsert at front
    setQueue(q=>[last.index, ...q]); if(last.type==='known') setKnown(k=>Math.max(0,k-1)); else setWrong(w=>Math.max(0,w-1)); lastActionRef.current=null; toast('Ultima azione annullata'); }

  useEffect(()=>{ if(isStudy){ if(queue.length===0){ setIsStudy(false); toast('Sessione completata 🎉'); track('flashcards_complete',{known, wrong, total, elapsedSec: elapsed()/1000|0}); } else if(cursor >= queue.length){ setCursor(0); setShowBack(false); } } },[queue, isStudy, cursor]);

  function elapsed(){ return startTime? Date.now()-startTime : 0; }
  const accuracy = percent(known, known+wrong || 0);
  const progressPct = total ? percent(known, total) : '0%';

  function toast(t){ if(window.ToolHubToast){ window.ToolHubToast(t); } else { setMsg(t); } }

  if(isStudy && currentCard){
    return (
      <div className="card" style={{display:'flex',flexDirection:'column',gap:12}}>
        <h3>Studio Flashcards</h3>
        <div style={{display:'flex',flexWrap:'wrap',gap:8,fontSize:12,opacity:.75}}>
          <span>Conosciute: {known}</span>
          <span>Errate: {wrong}</span>
          <span>Rimaste: {queue.length}</span>
          <span>Accuratezza: {accuracy}</span>
          <span>Progresso: {progressPct}</span>
          <span>Tempo: {(elapsed()/1000|0)}s</span>
        </div>
        <div style={{border:'1px solid var(--border)',borderRadius:8,padding:'28px 20px',minHeight:160,background:'var(--bg-alt)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center',fontSize:16,fontWeight:500}} onClick={flip}>
          {showBack ? (currentCard.back||'(vuoto)') : (currentCard.front||'(vuoto)')}
        </div>
        {!showBack && <div style={{fontSize:11,opacity:.55}}>Clic per vedere il retro</div>}
        {showBack && (
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button type="button" className="btn" onClick={()=>mark(true)}>Conosci</button>
            <button type="button" className="btn secondary" onClick={()=>mark(false)}>Ripeti dopo</button>
            <button type="button" className="btn outline" onClick={flip}>Torna fronte</button>
            <button type="button" className="btn outline" onClick={undo}>Undo</button>
          </div>
        )}
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button type="button" className="btn secondary" onClick={exitStudy}>Esci</button>
          <button type="button" className="btn outline" onClick={()=>startStudy(true)}>Restart</button>
        </div>
        <div style={{height:6,background:'var(--bg-muted)',borderRadius:4,overflow:'hidden'}}>
          <div style={{height:'100%',width:progressPct,background:'linear-gradient(90deg,#6366f1,#8b5cf6)'}} />
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>Flashcard generator</h3>
      <p style={{fontSize:12,opacity:.7,margin:'4px 0 10px'}}>Crea rapidamente flashcard domanda/risposta. Esporta JSON o PDF. Studio con ripetizione: le card sbagliate tornano in coda.</p>
      <div style={{display:'grid',gap:12}}>
        {cards.map((c,i)=>(
          <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1fr 34px',gap:8}}>
            <input placeholder="Fronte" value={c.front} onChange={e=>update(i,'front',e.target.value)} />
            <input placeholder="Retro" value={c.back} onChange={e=>update(i,'back',e.target.value)} />
            <button type="button" className="btn secondary" style={{padding:'6px 8px'}} onClick={()=>remove(i)}>✕</button>
          </div>
        ))}
        <button className="btn outline" type="button" onClick={addCard}>+ Aggiungi card</button>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="btn" type="button" onClick={()=>startStudy(true)}>Avvia studio</button>
          <button className="btn secondary" type="button" onClick={()=>startStudy(false)}>Studio (ordine)</button>
        </div>
      </div>
      <details style={{marginTop:14}}>
        <summary style={{cursor:'pointer',fontSize:'.75rem',opacity:.7}}>JSON sync (import / export manuale)</summary>
        <textarea rows={6} style={{width:'100%',marginTop:8}} value={syncJson} onChange={e=>setSyncJson(e.target.value)} />
        <div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>
          <button className="btn secondary" type="button" onClick={importJson}>Importa JSON</button>
          <button className="btn" type="button" onClick={exportJSON}>Esporta JSON</button>
          <button className="btn" type="button" onClick={exportPDF}>Esporta PDF</button>
        </div>
      </details>
      <div style={{marginTop:10,fontSize:'.7rem',color:'#64748b'}}>{msg}</div>
    </div>
  );
}

// Expose for dynamic loader (UMD style attach)
if(typeof window!== 'undefined'){
  window.FlashcardTool = FlashcardTool;
}
