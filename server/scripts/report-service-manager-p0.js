// Local read-only investigation. Detailed financial/customer IDs are written only
// to server/files (gitignored), never to public assets or stdout.
const fs=require('node:fs');const path=require('node:path');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const csv=rows=>{if(!rows.length)return '';const keys=Object.keys(rows[0]);const cell=value=>'"'+String(value??'').replaceAll('"','""')+'"';return [keys.map(cell).join(','),...rows.map(row=>keys.map(key=>cell(row[key])).join(','))].join('\n')+'\n';};
async function main(){
  const host=process.env.DB_HOST||'localhost';if(!['localhost','127.0.0.1','::1'].includes(host)||process.env.NODE_ENV==='production')throw new Error('Local non-production database required.');
  const db=await require('mysql2/promise').createConnection({host,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'rewardplanners_db',dateStrings:true});
  const directory=path.join(__dirname,'../files/service-manager-p0');fs.mkdirSync(directory,{recursive:true});
  try{
    await db.query('START TRANSACTION READ ONLY');
    const read=async sql=>(await db.query(sql))[0];
    const categories=await read('SELECT id,name,service_scope,status FROM service_categories ORDER BY id');
    const services=await read('SELECT s.id,s.name,s.category_id,c.name AS category_name,s.service_scope,s.status FROM services s LEFT JOIN service_categories c ON c.id=s.category_id ORDER BY s.id');
    const addresses=await read(`SELECT o.id AS order_id,o.order_ref,o.parent_order_id,o.user_id,o.address_id,o.created_at,o.status,
      'UNRESOLVED: missing address; deletion/migration/incorrect-link origin not proven' AS reconciliation_status
      FROM service_orders o LEFT JOIN customer_addresses a ON a.address_id=o.address_id WHERE o.address_id IS NOT NULL AND a.address_id IS NULL ORDER BY o.id`);
    const wallet=await read(`SELECT w.transaction_id,w.user_id,w.transaction_type,w.coins,w.reference_id,w.title,w.created_at,
      CASE WHEN w.title='Coins used for service' THEN 'Candidate SERVICE_REDEEM; manual approval required'
      WHEN w.title='Coins earned from completed service' THEN 'Candidate SERVICE_REWARD; manual approval required'
      ELSE 'Unresolved; do not infer reason' END AS investigation,
      EXISTS(SELECT 1 FROM service_orders o WHERE o.id=w.reference_id AND o.user_id=w.user_id) AS matching_service_customer
      FROM wallet_transactions w WHERE w.reason_code='' ORDER BY w.transaction_id`);
    for(const [name,rows]of Object.entries({'address-orphans':addresses,'wallet-reason-review':wallet,'classification-categories':categories,'classification-services':services}))fs.writeFileSync(path.join(directory,name+'.csv'),csv(rows));
    const signatures={};for(const [name,sql]of Object.entries({orders:"SELECT COUNT(*) AS n,BIT_XOR(CRC32(CONCAT_WS('#',id,user_id,price,COALESCE(original_price,'NULL'),reward_coins_used,reward_coins_earned))) AS checksum FROM service_orders",wallets:"SELECT COUNT(*) AS n,BIT_XOR(CRC32(CONCAT_WS('#',user_id,balance))) AS checksum FROM customer_wallet",ledger:"SELECT COUNT(*) AS n,BIT_XOR(CRC32(CONCAT_WS('#',transaction_id,user_id,transaction_type,coins,COALESCE(reason_code,'NULL'),COALESCE(reference_id,'NULL')))) AS checksum FROM wallet_transactions",scopes:"SELECT COUNT(*) AS n,BIT_XOR(CRC32(CONCAT_WS('#',id,COALESCE(service_scope,'NULL')))) AS checksum FROM services"}))signatures[name]=(await read(sql))[0];
    const baseline=path.join(directory,'baseline.json');if(!fs.existsSync(baseline))fs.writeFileSync(baseline,JSON.stringify(signatures,null,2),{flag:'wx'});
    const unchanged=JSON.stringify(JSON.parse(fs.readFileSync(baseline,'utf8')))===JSON.stringify(signatures);
    const summary={orphan_orders:addresses.length,missing_address_ids:[...new Set(addresses.map(row=>row.address_id))],empty_reason_records:wallet.map(row=>row.transaction_id),categories:categories.length,services:services.length,financial_snapshot_unchanged:unchanged};
    fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify(summary,null,2));
    fs.writeFileSync(path.join(directory,'verification.json'),JSON.stringify(signatures,null,2));
    console.log(JSON.stringify(summary));await db.rollback();
  }finally{await db.end();}
}
main().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});
