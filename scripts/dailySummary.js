// Daily summary script: aggregates basic metrics into daily_summaries table
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DB_PATH = path.join(__dirname,'..','data.sqlite');
const db = new sqlite3.Database(DB_PATH);

function all(sql,params=[]) { return new Promise((res,rej)=> db.all(sql,params,(e,r)=> e?rej(e):res(r))); }
function run(sql,params=[]) { return new Promise((res,rej)=> db.run(sql,params,function(e){ e?rej(e):res(this); })); }

(async function(){
  try {
    const date = new Date().toISOString().slice(0,10);
    const users = (await all('SELECT COUNT(*) as c FROM users'))[0].c;
    const usage = (await all('SELECT COUNT(*) as c FROM tool_usage'))[0].c;
    const downloads = (await all('SELECT COUNT(*) as c FROM downloads'))[0].c;
    const upsells = (await all('SELECT COUNT(*) as c FROM users WHERE is_pro=1'))[0].c;
    await run('INSERT OR REPLACE INTO daily_summaries (id,date,users,usage,downloads,upsells,created_at) VALUES ( (SELECT id FROM daily_summaries WHERE date=?),?,?,?,?,?, CURRENT_TIMESTAMP)',[date,date,users,usage,downloads,upsells]);
    console.log(JSON.stringify({ok:true,date,users,usage,downloads,upsells}));
    db.close();
  } catch(e){
    console.error('Summary failed', e);
    process.exitCode=1; db.close();
  }
})();
