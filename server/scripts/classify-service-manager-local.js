// Explicit, reviewed local data repair. Preview by default; never run on startup.
const path = require('node:path');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const approved = { categories:[1,2,3,4,5], services:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,18,19] };
async function main() {
  const host=process.env.DB_HOST||'localhost';
  if (!['localhost','127.0.0.1','::1'].includes(host)||process.env.NODE_ENV==='production') throw new Error('Local non-production database required.');
  const db=await require('mysql2/promise').createConnection({host,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'rewardplanners_db'});
  try {
    await db.beginTransaction();
    const actor=Number(process.argv.find(arg=>arg.startsWith('--actor='))?.split('=')[1]);
    const apply=process.argv.includes('--apply');
    if (apply) {
      const [[user]]=await db.execute("SELECT user_id FROM eusers WHERE user_id=? AND is_verified=1 AND role IN ('admin','service_manager')",[actor||0]);
      if (!user) throw new Error('Supply --actor=<verified manager/admin ID> for the audit history.');
    }
    // Reuse classification validation and audit writes in one outer transaction.
    const classify=require('../app/service/v1/models/serviceClassificationModel').createClassificationModel({getConnection:async()=>({
      execute:db.execute.bind(db),beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{},
    })});
    let changed=0;
    for (const [kind,ids] of Object.entries(approved)) {
      const table=kind==='categories'?'service_categories':'services';
      for (const id of ids) {
        const [[row]]=await db.execute(`SELECT * FROM ${table} WHERE id=? FOR UPDATE`,[id]);
        if (!row) throw new Error(`Approved ${kind} #${id} is missing.`);
        if (row.service_scope==='in_house') continue;
        if (row.service_scope!==null) throw new Error(`${kind} #${id} already belongs to another workspace.`);
        console.log(JSON.stringify({kind,id,name:row.name,from:null,to:'in_house'}));
        if (apply) await classify(kind,id,{
          service_scope:'in_house',version:JSON.stringify(row),
          reason:'Restore existing Service Manager records after workspace classification update.',
          review_reference:'2026-11-28: business owner confirmed all existing services are In-House',
        },actor);
        changed++;
      }
    }
    if (apply) await db.commit(); else await db.rollback();
    console.log(`${apply?'Applied':'Preview'}: ${changed} classifications. ${apply?'Audit entries saved.':'Use --apply --actor=<ID> to apply this reviewed list.'}`);
  } catch(error) { await db.rollback(); throw error; }
  finally { await db.end(); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
