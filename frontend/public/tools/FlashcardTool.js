// Migrated FlashcardTool
function FlashcardTool(){
  const API_BASE = (window.API_BASE || (location.port==='5173'?'http://localhost:3000':'')).replace(/\/$/,'');
  const [cards,setCards] = React.useState([{front:'Q1',back:'A1'}]);
  const [syncJson,setSyncJson] = React.useState('');
  const [msg,setMsg] = React.useState('');
  // Study mode state
  const [isStudy,setIsStudy] = React.useState(false);
  const [studyQueue,setStudyQueue] = React.useState([]); // indexes order
  const [currentIdx,setCurrentIdx] = React.useState(0); // position inside queue
  const [showBack,setShowBack] = React.useState(false);
  const [known,setKnown] = React.useState(0);
  const [sessionTotal,setSessionTotal] = React.useState(0);

  React.useEffect(()=>{ setSyncJson(JSON.stringify(cards,null,2)); },[cards]);
  function addCard(){ setCards(prev=> [...prev,{front:'',back:''}]); }
  function update(i,field,val){ setCards(prev=> prev.map((c,idx)=> idx===i? {...c,[field]:val}:c)); }
  function remove(i){ setCards(prev=> prev.filter((_,idx)=> idx!==i)); }
  function importJson(){ try { const parsed = JSON.parse(syncJson); if(Array.isArray(parsed)) setCards(parsed); else setMsg('JSON non valido (array richiesto)'); } catch(err){ setMsg('Errore parse JSON: '+err.message); } }
  function exportJSON(){ const blob = new Blob([JSON.stringify(cards,null,2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='flashcards.json'; a.click(); URL.revokeObjectURL(url); }
  async function exportPDF(){ setMsg('Generazione PDF...'); try{ const r = await fetch(API_BASE + '/api/export/flashcards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cards})}); if(!r.ok){ let j={}; try{ j=await r.json(); }catch(e){} setMsg('Errore: '+(j.error||r.status)); return; } const blob = await r.blob(); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='flashcards.pdf'; a.click(); URL.revokeObjectURL(url); setMsg('PDF pronto'); }catch(err){ setMsg('Errore rete: '+err.message); } }

  // Study mode helpers
  function startStudy(shuffle=true){ if(!cards.length){ setMsg('Aggiungi almeno una card'); return; } const idxs = cards.map((_,i)=>i); if(shuffle){ for(let i=idxs.length-1;i>0;i--){ const j=Math.floor(Math.random()* (i+1)); [idxs[i],idxs[j]]=[idxs[j],idxs[i]]; } } setStudyQueue(idxs); setCurrentIdx(0); setShowBack(false); setKnown(0); setSessionTotal(idxs.length); setIsStudy(true); }
  function exitStudy(){ setIsStudy(false); setStudyQueue([]); }
  const currentCardIndex = studyQueue[currentIdx];
  const currentCard = currentCardIndex!=null? cards[currentCardIndex]: null;
  function flip(){ setShowBack(s=>!s); }
  function markKnown(k){ if(currentCardIndex==null) return; setShowBack(false); setStudyQueue(q=>{ const nextQ=[...q]; if(k){ setKnown(x=>x+1); nextQ.splice(currentIdx,1); } else { // push to end for later review
        const [idxVal] = nextQ.splice(currentIdx,1); nextQ.push(idxVal); }
      return nextQ; });
    setTimeout(()=>{ setCurrentIdx(i=>{ const qLen = (prev=>prev)(studyQueue).length; // will be replaced after queue update, safe fallback
      return 0; }); },0); // reposition to first after mutation
  }
  React.useEffect(()=>{ // adjust when queue shrinks
    if(isStudy){ if(studyQueue.length===0){ setIsStudy(false); setMsg('Sessione completata 🎉'); } else if(currentIdx >= studyQueue.length){ setCurrentIdx(0); setShowBack(false); } }
  },[studyQueue,isStudy,currentIdx]);

  const progress = isStudy && sessionTotal>0 ? ((known/(sessionTotal||1))*100).toFixed(0) : null;

  if(isStudy && currentCard){
    return (
      <div className="card" style={{display:'flex',flexDirection:'column',gap:12}}>
        <h3>Studio Flashcards</h3>
        <div style={{fontSize:12,opacity:.7}}>{known} apprese / {sessionTotal} totali ({progress}%)</div>
        <div style={{border:'1px solid var(--border)',borderRadius:8,padding:'28px 20px',minHeight:140,background:'var(--bg-alt)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center',fontSize:16,fontWeight:500}} onClick={flip}>
          {showBack ? (currentCard.back||'(vuoto)') : (currentCard.front||'(vuoto)')}
        </div>
        {!showBack && <div style={{fontSize:11,opacity:.55}}>Clic per vedere il retro</div>}
        {showBack && (
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button type="button" className="btn" onClick={()=>markKnown(true)}>Conosci</button>
            <button type="button" className="btn secondary" onClick={()=>markKnown(false)}>Ripeti dopo</button>
            <button type="button" className="btn outline" onClick={flip}>Torna fronte</button>
          </div>
        )}
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button type="button" className="btn secondary" onClick={exitStudy}>Esci</button>
          <button type="button" className="btn outline" onClick={()=>startStudy(true)}>Restart</button>
        </div>
        <div style={{height:6,background:'var(--bg-muted)',borderRadius:4,overflow:'hidden'}}>
          <div style={{height:'100%',width:progress+'%',background:'linear-gradient(90deg,#6366f1,#8b5cf6)'}} />
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>Flashcard generator</h3>
      <p style={{fontSize:12,opacity:.7,margin:'4px 0 10px'}}>Crea rapidamente flashcard domanda/risposta. Puoi esportare in JSON oppure PDF per stampa. Suggerimento: mantieni le domande concise e una sola risposta diretta.</p>
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
window.FlashcardTool = FlashcardTool;
