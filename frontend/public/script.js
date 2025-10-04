// Deprecated legacy script (migrated to landing.js & toolsApp.js)
(function(){
  if(typeof window==='undefined') return;
  const root=document.getElementById('root');
  if(root){
    root.innerHTML='<div class="card"><strong>ToolHub</strong><br/>La pagina è stata aggiornata. Vai alla <a href="/">Home</a> oppure alla <a href="/tools.html">pagina Strumenti</a>.</div>';
    requestAnimationFrame(()=>{ document.body.classList.remove('preload'); document.body.classList.add('app-ready'); });
  }
})();
