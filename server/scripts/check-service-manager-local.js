// Read-only local API diagnostic. Tokens stay in memory and are never printed.
const path=require('path');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const {setTimeout:delay}=require('node:timers/promises');
async function main(){
  const host=process.env.DB_HOST||'localhost';
  if(!['localhost','127.0.0.1','::1'].includes(host))throw new Error('This diagnostic requires a local development database.');
  const db=await require('mysql2/promise').createConnection({host,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'rewardplanners_db',connectTimeout:3000});
  let user;
  try{
    [[user]]=await db.execute("SELECT user_id,role,is_verified FROM eusers WHERE user_id=? AND role='service_manager' AND is_verified=1",[Number(process.argv[2]||35)]);
    if(!user)throw new Error('The requested account is not a verified Service Manager.');
    const [columns]=await db.execute(`SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
      AND ((TABLE_NAME IN ('services','service_categories') AND COLUMN_NAME='service_scope') OR TABLE_NAME='service_manager_audit_logs'
      OR (TABLE_NAME='service_orders' AND COLUMN_NAME IN ('flash_sale_campaign_id','original_price')))`);
    console.log('Schema prerequisites:',JSON.stringify(columns));
  }finally{await db.end();}
  const origin=`http://localhost:${Number(process.env.PORT||5000)}`;
  let online=false;
  for(let attempt=0;attempt<30;attempt++){
    try{online=(await fetch(origin,{signal:AbortSignal.timeout(1500)})).ok;}catch{/* nodemon may be reloading */}
    if(online)break;await delay(1000);
  }
  if(!online)throw new Error('Local backend did not become ready.');
  const token=require('../utils/jwt').generateToken({user_id:user.user_id,role:user.role});
  const targets=[
    `${origin}/api/crm/v1/service-manager/catalog/categories?page=1&scope=in_house`,
    `${origin}/api/crm/v1/service-manager/in-house/summary`,
    `${origin}/api/crm/v1/service-orders/admin-orders?page=1&limit=10`,
    `${origin}/v1/service-manager/in-house/summary`,
    'http://localhost:5173/api/crm/v1/service-manager/catalog/categories?page=1&scope=in_house',
    'http://localhost:5173/api/crm/v1/service-manager/in-house/summary',
    'http://localhost:5173/api/crm/v1/service-orders/admin-orders?page=1&limit=10',
  ];
  for(const url of targets){
    try{
      const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)});
      const body=await response.json();
      console.log(JSON.stringify({url,status:response.status,message:body.message||null,records:body.data?.total??body.total??null}));
      if(!response.ok)process.exitCode=1;
    }catch(error){console.log(JSON.stringify({url,error:error.message}));process.exitCode=1;}
  }
}
main().catch(error=>{console.error('Local API diagnostic:',error.code||error.message);process.exitCode=1;});
