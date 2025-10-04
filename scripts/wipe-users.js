#!/usr/bin/env node
/** Wipe all user-related data (DANGEROUS). Creates automatic backup before deletion.
 * Usage: node scripts/wipe-users.js
 */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname,'..','data.sqlite');
if(!fs.existsSync(DB_PATH)){
  console.error('Database file not found at', DB_PATH);
  process.exit(1);
}

// 1. Backup
const ts = new Date().toISOString().replace(/[-:T]/g,'').slice(0,15);
const backupName = `data-backup-before-wipe-${ts}.sqlite`;
const backupPath = path.join(path.dirname(DB_PATH), backupName);
fs.copyFileSync(DB_PATH, backupPath);
console.log('Backup created:', backupName);

const db = new sqlite3.Database(DB_PATH);
function run(sql){ return new Promise((res,rej)=> db.run(sql, err=> err?rej(err):res())); }
function get(sql){ return new Promise((res,rej)=> db.get(sql, (err,row)=> err?rej(err):res(row))); }
(async()=>{
  try {
    // Order matters: child tables first
    const tables = [
      'sessions','password_resets','email_verifications','quote_templates','flashcard_decks','invoices','clients','tool_usage','downloads','ab_events','user_pins','support_messages','waitlist','users'
    ];
    for(const t of tables){
      try{ await run(`DELETE FROM ${t}`); console.log('Cleared', t); }catch(e){ console.warn('Skip',t,e.message); }
    }
    const row = await get('SELECT COUNT(*) as cnt FROM users');
    console.log('Users remaining:', row.cnt);
    console.log('WIPE COMPLETE');
  } catch (e){
    console.error('Error wiping users:', e);
    process.exit(2);
  } finally { db.close(); }
})();
