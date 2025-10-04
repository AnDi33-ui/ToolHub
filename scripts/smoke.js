// Simple smoke test for ToolHub API (CommonJS friendly, works with node-fetch v3 ESM)
const base = 'http://localhost:3000';

async function getFetch(){
  if (typeof fetch === 'function') return fetch; // Node >=18
  const mod = await import('node-fetch');
  return mod.default;
}

async function main(){
  const fetchFn = await getFetch();
  const results = {};
  async function check(name, fn){
    try { results[name] = await fn(); } catch(err){ results[name] = 'ERR:'+err.message; }
  }
  await check('health', async()=> (await fetchFn(base+'/health')).status);
  await check('root_json', async()=> { const r = await fetchFn(base+'/'); return r.headers.get('content-type')?.includes('application/json') ? r.status : 'NO_JSON'; });
  await check('usage', async()=> (await fetchFn(base+'/api/usage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({toolKey:'bmi'})})).status);
  await check('ats', async()=> (await fetchFn(base+'/api/ats')).status);
  await check('analytics', async()=> (await fetchFn(base+'/api/analytics')).status);
  await check('health_full', async()=> (await fetchFn(base+'/health/full')).status);
  await check('analytics_csv', async()=> { const r=await fetchFn(base+'/api/analytics/export'); return r.ok && (r.headers.get('content-type')||'').includes('text/csv') ? r.status : 'NO_CSV'; });
  console.table(results);
  const fails = Object.values(results).filter(v=> !(v===200 || v===201));
  if(fails.length){ process.exitCode = 1; }
}
main();
