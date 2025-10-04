/* global React */
import { track } from '../shared/api';

/* PdfJpgTool React version
   Improvements:
   - Drag & drop + file input
   - Progress bar per page conversion
   - Quality slider for PDF -> JPG (affects canvas toDataURL quality)
   - Cancel ongoing conversion
   - Toast notifications & tracking events
*/

export default function PdfJpgTool(){
  const { useState, useEffect, useRef } = React;
  const API_BASE = (window.API_BASE || (location.port==='5173'?'http://localhost:3000':'')).replace(/\/$/, '');
  const [mode,setMode] = useState('pdf2jpg');
  const [pdfImages,setPdfImages] = useState([]); // {page, dataUrl}
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [step,setStep] = useState(1);
  const [jpgFiles,setJpgFiles] = useState([]);
  const [libReady,setLibReady] = useState(false);
  const [quality,setQuality] = useState(0.9);
  const [progress,setProgress] = useState({current:0,total:0});
  const cancelRef = useRef(false);

  function toast(t){ if(window.ToolHubToast){ window.ToolHubToast(t); } else { setError(t); } }

  // Load libs
  useEffect(()=>{
    function ensure(src, onload){ if(document.querySelector(`script[src="${src}"]`)) return onload?.(); const s=document.createElement('script'); s.src=src; s.onload=onload; s.onerror=()=>setError('Errore caricamento libreria'); document.head.appendChild(s); }
    ensure('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',()=>{
      try { window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; setLibReady(true); } catch(e){ console.error(e); }
    });
    ensure('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
  },[]);

  function onDrop(e){ e.preventDefault(); if(busy) return; const file=e.dataTransfer.files[0]; if(mode==='pdf2jpg') convertPdfFile(file); else addJpgFiles(e.dataTransfer.files); }
  function addJpgFiles(fileList){ const files=Array.from(fileList||[]).filter(f=>/image\//.test(f.type)); setJpgFiles(files); toast(files.length+' immagini pronte'); }

  async function handlePDFInput(e){ const file = e.target.files[0]; if(file) convertPdfFile(file); }
  async function convertPdfFile(file){ if(!file){ return; } if(!/pdf$/i.test(file.type)){ setError('Seleziona un file PDF'); return; } setError(''); setBusy(true); setPdfImages([]); setStep(2); cancelRef.current=false; try { const arrayBuf = await file.arrayBuffer(); const pdf = await window.pdfjsLib.getDocument({data: arrayBuf}).promise; const imgs=[]; setProgress({current:0,total:pdf.numPages}); for(let p=1;p<=pdf.numPages;p++){ if(cancelRef.current){ toast('Conversione annullata'); break; } const page = await pdf.getPage(p); const viewport = page.getViewport({scale:1.5}); const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); canvas.width = viewport.width; canvas.height = viewport.height; await page.render({canvasContext:ctx, viewport}).promise; const dataUrl = canvas.toDataURL('image/jpeg',quality); imgs.push({ page:p, dataUrl }); setProgress({current:p,total:pdf.numPages}); }
      setPdfImages(imgs); if(!cancelRef.current){ setStep(3); toast('Conversione completata'); track('pdf2jpg_complete',{pages:imgs.length}); } } catch(err){ setError('Errore conversione: '+err.message); } finally { setBusy(false); }
  }

  function downloadAll(){ if(!pdfImages.length){ toast('Nessuna immagine'); return; } if(window.JSZip){ const zip = new window.JSZip(); pdfImages.forEach(img=>{ zip.file(`pagina-${img.page}.jpg`, img.dataUrl.split(',')[1], {base64:true}); }); zip.generateAsync({type:'blob'}).then(blob=>{ const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='pdf_pages.zip'; a.click(); URL.revokeObjectURL(url); toast('ZIP scaricato'); track('pdf2jpg_zip',{pages:pdfImages.length}); }); } else { pdfImages.forEach(img=>{ const a=document.createElement('a'); a.href=img.dataUrl; a.download=`pagina-${img.page}.jpg`; a.click(); }); }
  }

  async function handleJPGInput(e){ addJpgFiles(e.target.files); }
  async function sendJpgToPdf(){ if(!jpgFiles.length){ setError('Seleziona almeno un\'immagine'); return; } setError(''); toast('Creazione PDF...'); const fd = new FormData(); jpgFiles.forEach(f=>fd.append('files',f)); const r = await fetch(API_BASE + '/api/convert/jpg-to-pdf',{method:'POST',body:fd}); if(!r.ok){ let j={}; try{ j=await r.json(); }catch{} setError(j.error||'Errore'); toast('Errore conversione'); return; } const blob = await r.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='images.pdf'; a.click(); URL.revokeObjectURL(url); toast('PDF scaricato'); track('jpg2pdf_complete',{images:jpgFiles.length}); }

  function cancel(){ cancelRef.current=true; setBusy(false); }

  return (
    <div className="card" onDragOver={e=>e.preventDefault()} onDrop={onDrop}>
      <h3>Convertitore PDF ↔ JPG</h3>
      <div style={{fontSize:11,opacity:.7,margin:'4px 0 8px'}}>{libReady? 'Librerie pronte' : 'Caricamento librerie PDF.js...'}</div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:8}}>
        <button className={'btn '+(mode==='pdf2jpg'?'':'secondary')} onClick={()=>{setMode('pdf2jpg'); setStep(1);}}>PDF → JPG</button>
        <button className={'btn '+(mode==='jpg2pdf'?'':'secondary')} onClick={()=>{setMode('jpg2pdf'); setStep(1);}}>JPG → PDF</button>
      </div>
      {mode==='pdf2jpg' && (
        <div>
          {step===1 && <div>
            <p><strong>Step 1.</strong> Carica un file PDF oppure trascinalo qui.</p>
            <input type="file" accept="application/pdf" onChange={handlePDFInput} disabled={!libReady || busy} />
            <div style={{marginTop:8}}>
              <label style={{fontSize:12}}>Qualità JPG: {Math.round(quality*100)}%</label>
              <input type="range" min={50} max={95} value={Math.round(quality*100)} onChange={e=>setQuality(parseInt(e.target.value,10)/100)} />
            </div>
          </div>}
          {busy && <div style={{marginTop:8,fontSize:12}}>Conversione in corso... {progress.current}/{progress.total} {progress.total? '('+Math.round(progress.current/progress.total*100)+'%)':''} <button className="btn secondary" style={{padding:'2px 6px',marginLeft:8}} onClick={cancel}>Annulla</button></div>}
          {step===3 && (
            <div style={{marginTop:12}}>
              <p><strong>Step 3.</strong> Anteprima pagine ({pdfImages.length}). Clicca una immagine per scaricarla o scarica tutte.</p>
              <div style={{display:'grid',gap:10,gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))'}}>
                {pdfImages.map(img=> (
                  <div key={img.page} style={{border:'1px solid #e2e8f0',padding:4,borderRadius:8,background:'#fff'}}>
                    <img src={img.dataUrl} alt={'Pagina '+img.page} style={{width:'100%',borderRadius:4,cursor:'pointer'}} onClick={()=>{const a=document.createElement('a');a.href=img.dataUrl;a.download=`pagina-${img.page}.jpg`;a.click();}} />
                    <div style={{fontSize:10,textAlign:'center',marginTop:4}}>Pag {img.page}</div>
                  </div>
                ))}
              </div>
              <div style={{marginTop:12,display:'flex',gap:8}}>
                <button className="btn" type="button" onClick={downloadAll}>Scarica tutte (ZIP)</button>
                <button className="btn secondary" type="button" onClick={()=>{setStep(1); setPdfImages([]);}}>Nuovo PDF</button>
              </div>
            </div>
          )}
        </div>
      )}
      {mode==='jpg2pdf' && (
        <div>
          <p><strong>Step 1.</strong> Seleziona o trascina immagini (ordine = ordine nel PDF).</p>
          <input multiple type="file" accept="image/*" onChange={handleJPGInput} />
          {jpgFiles.length>0 && <div style={{marginTop:8,fontSize:12}}>{jpgFiles.length} immagini pronte.</div>}
          <div style={{marginTop:12}}>
            <button className="btn" type="button" onClick={sendJpgToPdf}>Converti in PDF</button>
            <button className="btn secondary" type="button" onClick={()=>setJpgFiles([])} disabled={!jpgFiles.length}>Reset</button>
          </div>
        </div>
      )}
      {error && <div style={{marginTop:10,color:'red',fontSize:12}}>{error}</div>}
      <details style={{marginTop:14}}>
        <summary style={{cursor:'pointer',fontSize:12,opacity:.7}}>Suggerimenti & note</summary>
        <ul style={{fontSize:12,lineHeight:1.5,marginTop:8}}>
          <li>Conversione pagine lato client (privacy migliore).</li>
          <li>Qualità regolabile: valori più alti = file più grandi.</li>
          <li>Per PDF molto grandi valuta una conversione server/queue.</li>
        </ul>
      </details>
    </div>
  );
}

if(typeof window!== 'undefined'){
  window.PdfJpgTool = PdfJpgTool;
}
