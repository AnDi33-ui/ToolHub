#!/usr/bin/env node
// Clean old tool bundles: keep only the newest (by mtime) per tool prefix.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname,'..','frontend','public','dist','tools');
if(!fs.existsSync(dir)){
  console.log('[clean-tools] directory not found, nothing to do');
  process.exit(0);
}

const files = fs.readdirSync(dir).filter(f => /^(InvoiceTool|QuoteTool)-[A-Z0-9]+\.js$/.test(f));
if(!files.length){
  console.log('[clean-tools] no hashed tool bundles found');
  process.exit(0);
}

// Group by prefix before first dash
const groups = files.reduce((acc,f)=>{ const key = f.split('-')[0]; (acc[key]=acc[key]||[]).push(f); return acc; },{});
let removed = 0;
for(const [prefix,list] of Object.entries(groups)){
  // Sort by mtime desc: newest first
  list.sort((a,b)=> fs.statSync(path.join(dir,b)).mtimeMs - fs.statSync(path.join(dir,a)).mtimeMs);
  const keep = list[0];
  const purge = list.slice(1);
  purge.forEach(f=>{
    try { fs.unlinkSync(path.join(dir,f)); removed++; console.log('[clean-tools] removed', f); } catch(e){ console.warn('[clean-tools] failed to remove', f, e.message); }
  });
  console.log(`[clean-tools] ${prefix}: keeping ${keep}, removed ${purge.length}`);
}
console.log(`[clean-tools] Done. Total removed: ${removed}`);
