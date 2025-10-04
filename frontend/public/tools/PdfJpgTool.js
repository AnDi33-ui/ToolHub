// Migrated PdfJpgTool
function PdfJpgTool(){
  const API_BASE = (window.API_BASE || (location.port==='5173'?'http://localhost:3000':'')).replace(/\/$/,'');
  const [mode,setMode] = React.useState('pdf2jpg');
  const [pdfImages,setPdfImages] = React.useState([]);
  const [busy,setBusy] = React.useState(false);
  const [error,setError] = React.useState('');
  const [step,setStep] = React.useState(1);
  const [jpgFiles,setJpgFiles] = React.useState([]);
  const [libReady,setLibReady] = React.useState(false);
  React.useEffect(()=>{
    let checkCount=0;
    function done(){ setLibReady(true); }
    if(!window.pdfjsLib){
      const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload=()=>{ try{ window['pdfjsLib'].GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; done(); }catch(e){ console.error('pdfjs worker set error',e); } };
      s.onerror=()=>{ setError('Impossibile caricare pdf.js'); };
      document.head.appendChild(s);
    } else { done(); }
    if(!window.JSZip){ const z=document.createElement('script'); z.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; document.head.appendChild(z); }
    const iv = setInterval(()=>{ checkCount++; if(window.pdfjsLib){ done(); clearInterval(iv); } if(checkCount>50){ clearInterval(iv); } },200);
    return ()=> clearInterval(iv);
  },[]);
  async function handlePDF(e){ const file = e.target.files[0]; if(!file){return;} if(!/pdf$/i.test(file.type)){ setError('Seleziona un file PDF'); return; } setError(''); setBusy(true); setPdfImages([]); setStep(2); try{ const arrayBuf = await file.arrayBuffer(); const pdf = await window.pdfjsLib.getDocument({data: arrayBuf}).promise; const imgs=[]; for(let p=1;p<=pdf.numPages;p++){ const page = await pdf.getPage(p); const viewport = page.getViewport({scale:1.5}); const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); canvas.width = viewport.width; canvas.height = viewport.height; await page.render({canvasContext:ctx, viewport}).promise; const dataUrl = canvas.toDataURL('image/jpeg',0.9); imgs.push({ page:p, dataUrl }); } setPdfImages(imgs); setStep(3); }catch(err){ setError('Errore conversione: '+err.message); } finally { setBusy(false); } }
  function downloadAll(){ if(window.JSZip){ const zip = new window.JSZip(); pdfImages.forEach(img=>{ zip.file(`pagina-${img.page}.jpg`, img.dataUrl.split(',')[1], {base64:true}); }); zip.generateAsync({type:'blob'}).then(blob=>{ const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='pdf_pages.zip'; a.click(); URL.revokeObjectURL(url); }); } else { pdfImages.forEach(img=>{ const a=document.createElement('a'); a.href=img.dataUrl; a.download=`pagina-${img.page}.jpg`; a.click(); }); } }
  async function handleJPG(e){ const files = Array.from(e.target.files||[]).filter(f=>/image\//.test(f.type)); setJpgFiles(files); }
  async function sendJpgToPdf(){ if(!jpgFiles.length){ setError('Seleziona almeno un\'immagine'); return; } setError(''); const fd = new FormData(); jpgFiles.forEach(f=>fd.append('files',f)); const r = await fetch(API_BASE + '/api/convert/jpg-to-pdf',{method:'POST',body:fd}); if(!r.ok){ let j={}; try{ j=await r.json(); }catch(e){} setError(j.error||'Errore'); return; } const blob = await r.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='images.pdf'; a.click(); URL.revokeObjectURL(url); }
  return (<div className="card"><h3>Convertitore PDF ↔ JPG</h3><div style={{fontSize:11,opacity:.7,margin:'4px 0 8px'}}>{libReady? 'Libreria PDF.js pronta' : 'Caricamento libreria PDF.js...'}</div><div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:8}}><button className={'btn '+(mode==='pdf2jpg'?'':'secondary')} onClick={()=>{setMode('pdf2jpg'); setStep(1);}}>PDF → JPG</button><button className={'btn '+(mode==='jpg2pdf'?'':'secondary')} onClick={()=>{setMode('jpg2pdf'); setStep(1);}}>JPG → PDF</button></div>{mode==='pdf2jpg' && (<div>{step===1 && <div><p><strong>Step 1.</strong> Carica un file PDF. Ogni pagina verrà convertita in JPG.</p><input type="file" accept="application/pdf" onChange={handlePDF} disabled={!libReady} /></div>}{busy && <div style={{marginTop:8}}>Conversione in corso...</div>}{step===3 && (<div style={{marginTop:12}}><p><strong>Step 3.</strong> Anteprima pagine ({pdfImages.length}). Clicca una immagine per scaricarla o scarica tutte.</p><div style={{display:'grid',gap:10,gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))'}}>{pdfImages.map(img=> (<div key={img.page} style={{border:'1px solid #e2e8f0',padding:4,borderRadius:8,background:'#fff'}}><img src={img.dataUrl} alt={'Pagina '+img.page} style={{width:'100%',borderRadius:4,cursor:'pointer'}} onClick={()=>{const a=document.createElement('a');a.href=img.dataUrl;a.download=`pagina-${img.page}.jpg`;a.click();}} /><div style={{fontSize:10,textAlign:'center',marginTop:4}}>Pag {img.page}</div></div>))}</div><div style={{marginTop:12}}><button className="btn" type="button" onClick={downloadAll}>Scarica tutte</button></div></div>)}</div>)}{mode==='jpg2pdf' && (<div><p><strong>Step 1.</strong> Seleziona una o più immagini JPG/PNG (ordine di selezione = ordine nel PDF).</p><input multiple type="file" accept="image/*" onChange={handleJPG} />{jpgFiles.length>0 && <div style={{marginTop:8,fontSize:12}}>{jpgFiles.length} immagini pronte.</div>}<div style={{marginTop:12}}><button className="btn" type="button" onClick={sendJpgToPdf}>Converti in PDF</button></div></div>)}{error && <div style={{marginTop:10,color:'red',fontSize:12}}>{error}</div>}<details style={{marginTop:14}}><summary style={{cursor:'pointer',fontSize:12,opacity:.7}}>Suggerimenti e note</summary><ul style={{fontSize:12,lineHeight:1.5,marginTop:8}}><li>Le immagini sono generate lato client (privacy migliore).</li><li>Per file PDF grandi usare una conversione server / queue.</li><li>Scaricare come ZIP sarebbe più comodo: implementare in futuro.</li></ul></details></div>);
}
window.PdfJpgTool = PdfJpgTool;
/* Migrated PdfJpgTool (unchanged) */
// ...original code will be loaded from legacy public for now (to reduce duplication in patch example)...
