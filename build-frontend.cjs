#!/usr/bin/env node
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const watch = process.argv.includes('--watch');
const isProd = !watch && process.env.NODE_ENV !== 'development';

const shared = {
  bundle: true,
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  target: ['es2018'],
  loader: { '.js':'jsx', '.jsx':'jsx' },
  logLevel: 'info'
};

const toolEntries = [
  'frontend/src/tools/InvoiceTool.jsx',
  'frontend/src/tools/QuoteTool.jsx',
  'frontend/src/tools/BmiTool.jsx',
  'frontend/src/tools/FlashcardTool.jsx',
  'frontend/src/tools/PdfJpgTool.jsx',
  'frontend/src/tools/TaxesTool.jsx'
];

async function buildMain(){
  return esbuild.build({
    entryPoints: [
      'frontend/src/landing.js',
      'frontend/src/toolsApp.jsx',
      'frontend/src/shared/ui/ToastHost.jsx'
    ],
    outdir: 'frontend/public/dist',
    entryNames: '[name]-[hash]',
    assetNames: '[name]-[hash]',
    chunkNames: 'chunk-[name]-[hash]',
    splitting: false,
    format: 'iife',
    globalName: 'ToolHubBundle',
    external: ['react','react-dom'],
    write: true,
    metafile: true,
    ...shared
  });
}

async function buildTools(){
  return esbuild.build({
    entryPoints: toolEntries,
    outdir: 'frontend/public/dist/tools',
    entryNames: '[name]-[hash]',
    format: 'iife',
    globalName: 'ToolHubTools',
    external: ['react','react-dom'],
    write: true,
    metafile: true,
    ...shared
  });
}

function rewriteHtml(mainMeta, toolsMeta){
  const distDir = path.join(__dirname,'frontend','public','dist');
  let landingFile, toolsAppFile, toastFile;
  for(const [outPath, meta] of Object.entries(mainMeta.outputs)){
    if(meta.entryPoint){
      if(meta.entryPoint.endsWith('landing.js')) landingFile = path.basename(outPath);
      if(meta.entryPoint.endsWith('toolsApp.jsx')) toolsAppFile = path.basename(outPath);
      if(meta.entryPoint.endsWith('ToastHost.jsx')) toastFile = path.basename(outPath);
    }
  }
  // Map tool key => built filename
  const toolMap = {};
  for(const [outPath, meta] of Object.entries(toolsMeta.outputs)){
    if(meta.entryPoint){
      if(meta.entryPoint.endsWith('InvoiceTool.jsx')) toolMap.invoice = 'tools/'+path.basename(outPath);
      if(meta.entryPoint.endsWith('QuoteTool.jsx')) toolMap.quote = 'tools/'+path.basename(outPath);
      if(meta.entryPoint.endsWith('BmiTool.jsx')) toolMap.bmi = 'tools/'+path.basename(outPath);
      if(meta.entryPoint.endsWith('FlashcardTool.jsx')) toolMap.flashcard = 'tools/'+path.basename(outPath);
      if(meta.entryPoint.endsWith('PdfJpgTool.jsx')) toolMap.pdfjpg = 'tools/'+path.basename(outPath);
      if(meta.entryPoint.endsWith('TaxesTool.jsx')) toolMap.taxes = 'tools/'+path.basename(outPath);
    }
  }
  function replaceInHtml(htmlPath){
    if(!fs.existsSync(htmlPath)) return;
    let html = fs.readFileSync(htmlPath,'utf8');
    if(landingFile){ html = html.replace(/(src=")\/dist\/landing(?:-[^"']+)?\.js(\")/,'$1/dist/'+landingFile+'$2'); }
    if(toolsAppFile){ html = html.replace(/(src=")\/dist\/toolsApp(?:-[^"']+)?\.js(")/,'$1/dist/'+toolsAppFile+'$2'); }
    if(toastFile && !html.includes(toastFile)){
      html = html.replace('</head>', `<script src="/dist/${toastFile}"></script>\n</head>`);
    }
    fs.writeFileSync(htmlPath, html,'utf8');
  }
  replaceInHtml(path.join(__dirname,'frontend','public','index.html'));
  replaceInHtml(path.join(__dirname,'frontend','public','tools.html'));

  // tool.html transformation: remove babel scripts, inject dynamic loader referencing built files
  const toolHtmlPath = path.join(__dirname,'frontend','public','tool.html');
  if(fs.existsSync(toolHtmlPath)){
    let html = fs.readFileSync(toolHtmlPath,'utf8');
    // Remove existing <script type="text/babel" ...>
    html = html.replace(/<script[^>]*type="text\/babel"[\s\S]*?<\/script>/g,'');
    // Remove any babel-standalone script includes
    html = html.replace(/<script[^>]+babel-standalone[^>]*><\/script>/g,'');
    // Remove any existing React / ReactDOM UMD duplicates so we can re-insert exactly once
    html = html.replace(/<script[^>]+react@17\/umd\/react\.development\.js"?><\/script>/g,'');
    html = html.replace(/<script[^>]+react-dom@17\/umd\/react-dom\.development\.js"?><\/script>/g,'');
    // Remove production React duplicates entirely (will re-insert one pair later)
    html = html.replace(/<script[^>]+react@17\/umd\/react\.production\.min\.js"?><\/script>/g,'');
    html = html.replace(/<script[^>]+react-dom@17\/umd\/react-dom\.production\.min\.js"?><\/script>/g,'');
    // Remove any previously injected dynamic loader scripts (those starting with window.API_BASE)
    html = html.replace(/<script>window\.API_BASE[\s\S]*?<\/script>/g,'');
    // Remove multiple consecutive blank lines
    html = html.replace(/\n{2,}/g,'\n');
    const loader = `\n<script>window.API_BASE=window.API_BASE||'http://localhost:3000';(function(){const started=Date.now();function elapsed(){return (Date.now()-started)+'ms';}const params=new URLSearchParams(location.search);const key=params.get('tool');const alias={preventivo:'quote',preventivi:'quote','preventivo-pdf':'quote','preventivi-pdf':'quote','fattura':'invoice','fatture':'invoice','imc':'bmi','flashcards':'flashcard','schede':'flashcard','pdf':'pdfjpg','pdf-jpg':'pdfjpg','tasse':'taxes'};const finalKey=alias[key]||key;const root=document.getElementById('tool-root');function showError(msg,extra){console.error('[tool-loader]',msg,extra||'');root.innerHTML='<div class="card" style="border:2px solid #c33"><h3>Errore caricamento tool</h3><p>'+msg+'</p><details><summary>Dettagli</summary><pre style="white-space:pre-wrap;font-size:12px">'+(extra?String(extra).replace(/[<>]/g,''):'')+'</pre></details><p style="font-size:12px;opacity:.7">Param ?tool='+key+' final='+finalKey+' elapsed '+elapsed()+'</p><button onclick="location.reload()">Riprova</button></div>';}
if(!finalKey){root.innerHTML='<div class=card>Param ?tool mancante. Usa es: ?tool=invoice</div>';return;}const valid=['invoice','quote','bmi','flashcard','pdfjpg','taxes'];const map=${JSON.stringify(toolMap)};if(!map[finalKey]){showError('Tool non compilato oppure nome errato. Validi: '+valid.join(', '));return;}
window.addEventListener('error',e=>{ if(!root.dataset.mounted) showError('Errore JS globale', e.message||e.error); });
window.addEventListener('unhandledrejection',e=>{ if(!root.dataset.mounted) showError('Promise rejection', e.reason); });
      let mountAttempts=0;function tryRender(cmp){ReactDOM.render(React.createElement(cmp),root);root.dataset.mounted='1';document.body.classList.add('app-ready');}
      function mount(){mountAttempts++;if(!window.React||!window.ReactDOM){if(mountAttempts>120){showError('React non caricato (CDN bloccato?). Controlla rete / AdBlock');return;}return setTimeout(mount,50);}try{const tools=window.ToolHubTools||{};if(finalKey==='invoice'&&tools.InvoiceTool)return tryRender(tools.InvoiceTool);if(finalKey==='quote'&&tools.QuoteTool)return tryRender(tools.QuoteTool);if(finalKey==='bmi'&&tools.BmiTool)return tryRender(tools.BmiTool);if(finalKey==='flashcard'&&tools.FlashcardTool)return tryRender(tools.FlashcardTool);if(finalKey==='pdfjpg'&&tools.PdfJpgTool)return tryRender(tools.PdfJpgTool);if(finalKey==='taxes'&&tools.TaxesTool)return tryRender(tools.TaxesTool);if(tools.default){console.warn('[tool-loader] fallback default export');return tryRender(tools.default);} }catch(err){showError('Errore mount',err);}if(mountAttempts>400){showError('Timeout montaggio tool');return;}setTimeout(mount,60);}const file=map[finalKey];const s=document.createElement('script');s.src='/dist/'+file+'?v='+(Date.now?Date.now():Math.random());s.async=true;s.onerror=function(){showError('Impossibile caricare bundle: '+s.src);};s.onload=function(){console.log('[tool-loader] bundle caricato', file);};document.body.appendChild(s);mount();})();</script>`;
    // Always (re)insert a single React / ReactDOM pair before </head>
    const reactScripts = isProd
      ? '<script crossorigin src="https://unpkg.com/react@17/umd/react.production.min.js"></script>\n<script crossorigin src="https://unpkg.com/react-dom@17/umd/react-dom.production.min.js"></script>'
      : '<script crossorigin src="https://unpkg.com/react@17/umd/react.development.js"></script>\n<script crossorigin src="https://unpkg.com/react-dom@17/umd/react-dom.development.js"></script>';
    html = html.replace('</head>', reactScripts+'\n</head>');
    html = html.replace(/<footer[\s\S]*?<\/footer>/, '$&'+loader);
    if(toastFile && !html.includes(toastFile)){
      html = html.replace('</head>', `<script src="/dist/${toastFile}"></script>\n</head>`);
    }
    fs.writeFileSync(toolHtmlPath, html,'utf8');
  }
}

// Prune old hashed tool bundles (keep newest 2 per tool) to avoid disk bloat
function pruneOldToolBundles(){
  const dir = path.join(__dirname,'frontend','public','dist','tools');
  if(!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(f=>/^(InvoiceTool|QuoteTool|BmiTool|FlashcardTool|PdfJpgTool|TaxesTool)-[A-Z0-9]+\.js$/.test(f));
  const groups = files.reduce((acc,f)=>{ const base=f.split('-')[0]; (acc[base]=acc[base]||[]).push(f); return acc; },{});
  for(const [base,list] of Object.entries(groups)){
    list.sort((a,b)=> fs.statSync(path.join(dir,b)).mtimeMs - fs.statSync(path.join(dir,a)).mtimeMs); // newest first
    const toDelete = list.slice(2); // keep 2
    for(const f of toDelete){
      try { fs.unlinkSync(path.join(dir,f)); console.log('[prune] removed old', f); } catch(e){ /* ignore */ }
    }
  }
}

async function run(){
  const mainRes = await buildMain();
  const toolsRes = await buildTools();
  rewriteHtml(mainRes.metafile, toolsRes.metafile);
  pruneOldToolBundles();
  console.log('[build] Tool bundles:', Object.values(toolsRes.metafile.outputs).filter(o=>o.entryPoint).map(_=>_.entryPoint));
}

if(watch){
  // Unified watch: main + tools
  esbuild.context({
    entryPoints:[
      'frontend/src/landing.js',
      'frontend/src/toolsApp.jsx',
      ...toolEntries
    ],
    outdir:'frontend/public/dist',
    entryNames:'[name]',
    format:'iife',
    globalName:'ToolHubBundle',
    external:['react','react-dom'],
    splitting:false,
    ...shared,
  }).then(ctx=>{ ctx.watch(); console.log('[watch] esbuild watching (main + tools).'); });
} else {
  run().catch(e=>{ console.error(e); process.exit(1); });
}
