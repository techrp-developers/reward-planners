// Local HTTP reads plus explicitly rejected authorization probes. No successful writes.
const fs=require('node:fs'),path=require('node:path');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
async function main(){
  if(process.env.NODE_ENV==='production'||!['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST||'localhost'))throw new Error('Local non-production environment required.');
  const db=await require('mysql2/promise').createConnection({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'rewardplanners_db'});
  let manager;try { [[manager]]=await db.execute("SELECT user_id FROM eusers WHERE user_id=35 AND role='service_manager' AND is_verified=1"); } finally { await db.end(); }
  if(!manager)throw new Error('Verified local test manager unavailable.');
  const token=require('../utils/jwt').generateToken({user_id:manager.user_id,role:'service_manager'}),origin=`http://localhost:${Number(process.env.PORT||5000)}`;
  const report=[];
  const call=async(url,expected,authenticated=true,method='GET',body)=>{
    const reply=await fetch(url,{method,headers:{...(authenticated?{Authorization:`Bearer ${token}`}:{}) ,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});
    const text=await reply.text();let payload;try { payload=JSON.parse(text); } catch { payload={}; }
    const row={url,method,status:reply.status,expected,pass:reply.status===expected,message:payload.message||null};report.push(row);console.log(JSON.stringify(row));if(!row.pass)process.exitCode=1;
  };
  for(const base of [origin,'http://localhost:5173'])for(const suffix of ['/service-manager/dashboard/summary','/service-manager/in-house/summary','/service-manager/catalog/categories','/service-manager/catalog/services','/service-manager/catalog/variants','/service-enquiry','/service-orders/admin-orders'])await call(`${base}/api/crm/v1${suffix}`,200);
  for(const suffix of ['/service/all-services?limit=1','/service/details/1','/service-variant/find/1'])await call(`${origin}/v1${suffix}`,200,false);
  await call(`${origin}/v1/service-manager/dashboard/summary`,401,false);
  await call(`${origin}/v1/service-manager/classification/services/1`,403,true,'PATCH',{service_scope:'partner'});
  await call(`${origin}/v1/service/create-service`,403,true,'POST',{});
  const directory=path.join(__dirname,'../files/service-manager-p0');fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'http-verification.json'),JSON.stringify({tested_at:new Date().toISOString(),report},null,2));
}
main().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});
