#!/usr/bin/env node
const esbuild = require('esbuild');
const path = require('path');
const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  target: ['es2018'],
  loader: { '.js':'jsx', '.jsx':'jsx' },
  logLevel: 'info'
};

async function run(){
  const result = await esbuild.build({
    entryPoints: [
      'frontend/src/landing.js',
      'frontend/src/toolsApp.jsx'
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
  const fs = require('fs');
  const distDir = path.join(__dirname,'frontend','public','dist');
  // Map original entry name => hashed file
  const outputs = Object.entries(result.metafile.outputs);
  let landingFile, toolsFile;
  for(const [outPath, meta] of outputs){
    if(meta.entryPoint){
      if(meta.entryPoint.endsWith('landing.js')) landingFile = path.basename(outPath);
      if(meta.entryPoint.endsWith('toolsApp.jsx')) toolsFile = path.basename(outPath);
    }
  }
  function replaceInHtml(htmlPath){
    let html = fs.readFileSync(htmlPath,'utf8');
    if(landingFile){
      const re = /(src=\")\/dist\/landing(?:-[^"']+)?\.js(\")/;
      if(re.test(html)) html = html.replace(re, `$1/dist/${landingFile}$2`);
    }
    if(toolsFile){
      const re2 = /(src=\")\/dist\/toolsApp(?:-[^"']+)?\.js(\")/;
      if(re2.test(html)) html = html.replace(re2, `$1/dist/${toolsFile}$2`);
    }
    fs.writeFileSync(htmlPath, html, 'utf8');
  }
  replaceInHtml(path.join(__dirname,'frontend','public','index.html'));
  replaceInHtml(path.join(__dirname,'frontend','public','tools.html'));
  console.log('[build] Frontend bundles generated with hashing:', { landingFile, toolsFile });
}

if(watch){
  esbuild.context({
    entryPoints:['frontend/src/landing.js','frontend/src/toolsApp.jsx'],
    outdir:'frontend/public/dist',
    entryNames:'[name]', // no hashing in watch for simplicity
    format:'iife',
    globalName:'ToolHubBundle',
    external:['react','react-dom'],
    ...shared,
  }).then(ctx=>{ ctx.watch(); console.log('[watch] esbuild watching (no hash).'); });
} else {
  run().catch(e=>{ console.error(e); process.exit(1); });
}
