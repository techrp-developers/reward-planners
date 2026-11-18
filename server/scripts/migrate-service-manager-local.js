// Explicit local-development setup; never invoked by server startup.
// No record classification, wallet changes, price backfills or enum alterations.
const fs=require('node:fs');
const path=require('node:path');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
async function main(){
  const host=process.env.DB_HOST||'localhost';
  if(!['localhost','127.0.0.1','::1'].includes(host)||process.env.NODE_ENV==='production')throw new Error('Only a localhost, non-production database is supported.');
  const db=await require('mysql2/promise').createConnection({host,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'rewardplanners_db',connectTimeout:3000});
  try{
    const [existing]=await db.execute(`SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('services','service_categories','service_orders','service_manager_audit_logs')`);
    const columns=new Set(existing.map(row=>`${row.TABLE_NAME}.${row.COLUMN_NAME}`));
    const additions={
      service_categories:{service_scope:"ENUM('in_house','partner') NULL",description:'TEXT NULL',sort_order:'INT NOT NULL DEFAULT 0',updated_at:'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'},
      services:{service_scope:"ENUM('in_house','partner') NULL"},
      service_orders:{flash_sale_campaign_id:'INT NULL',original_price:'DECIMAL(10,2) NULL'},
    };
    const plan=[];
    for(const [table,fields]of Object.entries(additions)){
      const missing=Object.entries(fields).filter(([column])=>!columns.has(`${table}.${column}`));
      if(missing.length)plan.push(`ALTER TABLE ${table} ${missing.map(([column,type])=>`ADD COLUMN ${column} ${type}`).join(', ')}`);
    }
    const [indexes]=await db.execute(`SELECT DISTINCT TABLE_NAME,INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('services','service_categories')`);
    const present=new Set(indexes.map(row=>`${row.TABLE_NAME}.${row.INDEX_NAME}`));
    if(!present.has('service_categories.idx_sm_category_scope'))plan.push('ALTER TABLE service_categories ADD INDEX idx_sm_category_scope (service_scope,status,sort_order)');
    if(!present.has('services.idx_sm_service_scope'))plan.push('ALTER TABLE services ADD INDEX idx_sm_service_scope (service_scope,status,category_id)');
    if(!existing.some(row=>row.TABLE_NAME==='service_manager_audit_logs')){
      const sql=fs.readFileSync(path.join(__dirname,'../migrations/20261117_01_service_manager_workspace.sql'),'utf8');
      const create=sql.match(/CREATE TABLE service_manager_audit_logs\s*\([\s\S]*?ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;/);
      if(!create)throw new Error('Reviewed audit migration definition not found.');
      plan.push(create[0]);
    }
    console.log(`Local development schema: ${plan.length} additive statements pending.`);
    if(!process.argv.includes('--apply')){console.log(plan.join(';\n'));console.log('Preview only. Use --apply to execute on localhost.');return;}
    for(const sql of plan){await db.query(sql);console.log(`Applied: ${sql.split('\n')[0]}`);}
    console.log('Local schema ready. Existing records were not classified or repriced.');
  }finally{await db.end();}
}
main().catch(error=>{console.error('Local workspace migration:',error.code||error.message);process.exitCode=1;});
