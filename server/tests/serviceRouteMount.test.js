const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const mountServiceRoutes=require('../routes/mountServiceRoutes');

test('CRM service requests preserve paths, parameters and legacy /v1 aliases',async()=>{
  const app=express();
  const router=express.Router();
  for(const path of ['/service-manager/catalog/categories','/service-manager/in-house/summary','/service-orders/admin-orders','/service-enquiry','/service-variant/find/:serviceId']){
    router.get(path,(req,res)=>res.json({path:req.path,query:req.query,serviceId:req.params.serviceId}));
  }
  mountServiceRoutes(app,router);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try{
    for(const prefix of ['/api/crm/v1','/v1']){
      for(const suffix of ['/service-manager/catalog/categories?page=1&scope=in_house','/service-manager/in-house/summary','/service-orders/admin-orders?page=2','/service-enquiry','/service-variant/find/12']){
        const response=await fetch(`${origin}${prefix}${suffix}`);
        assert.equal(response.status,200,`${prefix}${suffix}`);
        const body=await response.json();assert.equal(body.path,suffix.split('?')[0]);
        if(suffix.includes('scope='))assert.equal(body.query.scope,'in_house');
        if(suffix.endsWith('/12'))assert.equal(body.serviceId,'12');
      }
    }
  }finally{await new Promise(resolve=>server.close(resolve));}
});
