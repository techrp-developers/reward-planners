const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
function mock(relative,exports){const file=require.resolve(relative);require.cache[file]={id:file,filename:file,loaded:true,exports};}
let schemaReady=false;
mock('../../../../config/database',{execute:async(sql,args)=>{
  if(sql.includes('FROM eusers'))return [[{user_id:args[0],email:'test@example.invalid',role:args[0]===35?'service_manager':'vendor_manager',is_verified:1}]];
  if(sql.includes('information_schema.COLUMNS'))return [schemaReady?[{},{},{}]:[]];
  throw new Error('Unexpected database access');
}});
mock('../../../../utils/jwt',{verifyToken:token=>({user_id:token==='manager'?35:12,type:'access'})});
test('protected service management routes enforce authentication, role and migration readiness',async t=>{
  const app=express();app.use(express.json());
  const serviceRouter=express.Router();serviceRouter.use('/service-manager',require('../routes/serviceManagerRoute'));
  require('../../../../routes/mountServiceRoutes')(app,serviceRouter);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const address=`http://127.0.0.1:${server.address().port}/v1/service-manager`;
  try{
    await t.test('anonymous request is rejected before any catalogue read',async()=>{
      const response=await fetch(`${address}/dashboard/summary`);assert.equal(response.status,401);
    });
    await t.test('another internal role does not gain workspace permissions',async()=>{
      const response=await fetch(`${address}/dashboard/summary`,{headers:{authorization:'Bearer other'}});assert.equal(response.status,403);
    });
    await t.test('verified manager gets an actionable migration error',async()=>{
      const response=await fetch(`${address}/dashboard/summary`,{headers:{authorization:'Bearer manager'}});assert.equal(response.status,503);assert.match((await response.json()).message,/20261117_01/);
    });
    await t.test('CRM-prefixed workspace requests reach protected APIs instead of a 404',async()=>{
      const crm=`http://127.0.0.1:${server.address().port}/api/crm/v1/service-manager`;
      for(const suffix of ['/catalog/categories?page=1&search=&status=&sort=recent&scope=in_house&_request=1794908231165','/in-house/summary?_request=1794908256003']){
        const response=await fetch(`${crm}${suffix}`,{headers:{authorization:'Bearer manager'}});
        assert.equal(response.status,503);assert.match((await response.json()).message,/20261117_01/);
      }
    });
    await t.test('unknown catalogue type cannot access a caller-selected table',async()=>{
      schemaReady=true;
      const response=await fetch(`${address}/catalog/eusers`,{headers:{authorization:'Bearer manager'}});assert.equal(response.status,400);
    });
    await t.test('service managers cannot approve business classification through either prefix',async()=>{
      for (const prefix of ['/v1','/api/crm/v1']) {
        const response=await fetch(`http://127.0.0.1:${server.address().port}${prefix}/service-manager/classification/services/1`,{method:'PATCH',headers:{authorization:'Bearer manager','content-type':'application/json'},body:JSON.stringify({service_scope:'partner'})});
        assert.equal(response.status,403);
      }
    });
  }finally{await new Promise(resolve=>server.close(resolve));}
});
