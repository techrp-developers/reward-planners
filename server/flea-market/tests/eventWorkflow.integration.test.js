const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');

test('isolated MySQL event reservations, billing, replay and dashboard', {skip:process.env.FLEA_MARKET_INTEGRATION!=='1'},async t=>{
  require('dotenv').config({path:path.join(__dirname,'../../.env'),quiet:true});
  const mysql=require('mysql2/promise');
  const source=process.env.DB_NAME||'rewardplanners_db';
  const scratch=`fm_test_${process.pid}_${Date.now()}`;
  const config={host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',dateStrings:true,multipleStatements:true};
  const admin=await mysql.createConnection(config);
  let pool;
  try {
    await admin.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci',[scratch]);
    const tables=['eusers','companies','vendors','vendor_contacts','eproducts','product_variants','product_images','customer','company_users','reward_rules','product_reward_settings','customer_wallet','wallet_transactions','invoices','invoice_items','flea_market_locations','flea_market_schedules','flea_market_sessions','flea_market_checkout_idempotency','flea_market_vendor_stock','flea_market_stock_logs','busbooking_orders','busbooking_cancellations','auth_refresh_tokens'];
    // LIKE copies schema/indexes/generated expressions, never production data.
    for (const table of tables) await admin.query('CREATE TABLE ??.?? LIKE ??.??',[scratch,table,source,table]);
    pool=mysql.createPool({...config,database:scratch,connectionLimit:8});
    // Copy the explicitly protected historical rows into staging and verify
    // both migrations leave them byte-for-byte unchanged. Never write source.
    const [originalHistory]=await admin.query('SELECT * FROM ??.invoices WHERE invoice_id IN (34,35,36) ORDER BY invoice_id',[source]);
    for (const invoice of originalHistory) await pool.query('INSERT INTO invoices SET ?',[invoice]);
    await pool.query(fs.readFileSync(path.join(__dirname,'../migrations/20261016_01_event_assignments.sql'),'utf8'));
    await pool.query(fs.readFileSync(path.join(__dirname,'../../migrations/20261016_02_busbooking_reconciliation.sql'),'utf8'));
    const [stagedHistory]=await pool.query('SELECT * FROM invoices WHERE invoice_id IN (34,35,36) ORDER BY invoice_id');
    assert.deepEqual(stagedHistory,originalHistory,'Migrations must preserve copied historical invoices');
    // Synthetic workflow fixtures run separately from the copied history.
    await pool.query('DELETE FROM invoices');
    const dbPath=require.resolve('../../config/database');
    require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:pool};
    const mailPath=require.resolve('../../services/mailBuilder/fleaMarketOrderPlaced');
    require.cache[mailPath]={id:mailPath,filename:mailPath,loaded:true,exports:{sendFleaMarketOrderPlacedEmails:async()=>{}}};
    for (const moduleName of ['../../config/mail','../../services/mailService']) {
      const modulePath=require.resolve(moduleName);
      require.cache[modulePath]={id:modulePath,filename:modulePath,loaded:true,exports:{sendOtpEmail:async()=>{},sendPasswordResetEmail:async()=>{},sendMail:async()=>{}}};
    }
    const event=require('../services/eventAssignmentService');
    const schedule=require('../services/scheduleService');
    const checkout=require('../services/checkoutService');
    const dashboard=require('../services/dashboardService');
    await t.test('manager authentication and role gates reject unauthorized access',async()=>{
      const {authenticateToken,authorizeRoles}=require('../../middleware/auth');
      const response={status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
      await authenticateToken({headers:{}},response,()=>assert.fail('Anonymous request reached handler'));
      assert.equal(response.code,401);
      authorizeRoles('flea_market_manager')({user:{role:'vendor'}},response,()=>assert.fail('Vendor reached manager handler'));
      assert.equal(response.code,403);
      let allowed=false;
      authorizeRoles('flea_market_manager')({user:{role:'flea_market_manager'}},response,()=>{allowed=true;});
      assert.equal(allowed,true);
    });
    await pool.query("INSERT INTO eusers (user_id,name,email,role,is_verified) VALUES (1,'Test Manager','manager@test.invalid','flea_market_manager',1),(2,'Test Vendor','vendor@test.invalid','vendor',0)");
    await pool.query("INSERT INTO companies(company_id,company_name,status) VALUES (1,'Test Company',1)");
    await pool.query("INSERT INTO vendors(vendor_id,user_id,company_name,status) VALUES (1,2,'Test Vendor','approved')");
    await pool.query("INSERT INTO flea_market_locations(location_id,company_id,name) VALUES (1,1,'Test Hall')");
    const [[clock]]=await pool.query("SELECT DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','+05:30'),'%Y-%m-%d') today");
    const first=await schedule.createSchedule({companyId:1,locationId:1,scheduledDate:clock.today,createdBy:1});
    const next=await schedule.createSchedule({companyId:1,locationId:1,scheduledDate:'2099-01-02',createdBy:1});
    await pool.query("INSERT INTO eproducts(product_id,vendor_id,product_name,status) VALUES (1,1,'Test Product','approved')");
    await pool.query("INSERT INTO product_variants(variant_id,product_id,sku,variant_attributes,mrp,sale_price,stock) VALUES (1,1,'TEST-1','{}',100,100,0)");
    await pool.query("INSERT INTO flea_market_vendor_stock(pool_id,vendor_id,product_id,variant_id,allocated_qty) VALUES (1,1,1,1,5)");
    await pool.query("INSERT INTO customer(user_id,company_id,name,email,password,status) VALUES (1,1,'Test Customer','customer@test.invalid','unused',1)");
    await pool.query("INSERT INTO flea_market_sessions(session_id,user_id,company_id,location_id,otp_verified_at,expires_at) VALUES ('test-session',1,1,1,NOW(),DATE_ADD(NOW(),INTERVAL 1 HOUR))");
    await pool.query("INSERT INTO flea_market_session_managers(session_id,manager_user_id) VALUES ('test-session',1)");
    await t.test('customer billing session cannot be used by a different manager',async()=>{
      const middleware=require('../middlewares/requireFleaMarketSession');
      const response={status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
      await middleware({header:()=> 'test-session',user:{user_id:2}},response,()=>assert.fail('Another manager used customer session'));
      assert.equal(response.code,403);
    });
    await event.addVendor(first.scheduleId,{vendorId:1,collectionModel:'reward_planners'},1);
    await event.addVendor(next.scheduleId,{vendorId:1,collectionModel:'vendor'},1);
    await t.test('duplicate participation is rejected without changing history',async()=>{
      await assert.rejects(event.addVendor(first.scheduleId,{vendorId:1},1),e=>e.statusCode===409);
    });
    await t.test('concurrent events cannot double-reserve the shared pool',async()=>{
      const result=await Promise.allSettled([event.assign(first.scheduleId,{poolId:1,assignedQty:4},1),event.assign(next.scheduleId,{poolId:1,assignedQty:4},1)]);
      assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
      const [[reserved]]=await pool.query("SELECT SUM(assigned_qty-sold_qty-released_qty) qty FROM flea_market_event_products WHERE status='active'");
      assert.equal(Number(reserved.qty),4);
      const [assigned]=await pool.query('SELECT * FROM flea_market_event_products');
      if (assigned[0].schedule_id!==first.scheduleId) {
        await event.release(next.scheduleId,assigned[0].id);
        await event.assign(first.scheduleId,{poolId:1,assignedQty:4},1);
      }
    });
    const session={sessionId:'test-session',userId:1,companyId:1,locationId:1,verified:true};
    const items=[{variantId:1,qty:2,pointsApplied:0}];
    const options={scheduleId:first.scheduleId,managerId:1,payment:{method:'cash',amount:'200.00',confirmed:true}};
    const key='integration_checkout_0001';
    let result;
    await t.test('checkout invoices once, records cashier payment and changes only pooled stock',async()=>{
      result=await checkout.checkout(session,key,items,options);
      assert.equal(result.invoices.length,1);
      const [[stock]]=await pool.query('SELECT available_qty,sold_qty FROM flea_market_vendor_stock WHERE pool_id=1');
      assert.equal(stock.available_qty,3); assert.equal(stock.sold_qty,2);
      const [[variant]]=await pool.query('SELECT stock FROM product_variants WHERE variant_id=1');assert.equal(variant.stock,0);
      const [[payment]]=await pool.query('SELECT * FROM flea_market_payments');
      assert.equal(payment.status,'confirmed');assert.equal(payment.verification_source,'cashier');
    });
    await t.test('completed retry returns the same invoices and mismatched replay fails',async()=>{
      const again=await checkout.checkout(session,key,items,options);
      assert.equal(again.invoices[0].invoiceId,result.invoices[0].invoiceId);
      await assert.rejects(checkout.checkout(session,key,[{...items[0],qty:3}],options),e=>e.statusCode===409);
      await assert.rejects(checkout.checkout({...session,sessionId:'other-session'},key,items,options));
      const [[count]]=await pool.query('SELECT COUNT(*) total FROM invoices');assert.equal(count.total,1);
    });
    await t.test('dashboard keeps invoice, unit and payment totals separate',async()=>{
      const data=await dashboard.summary({scheduleId:first.scheduleId});
      assert.equal(Number(data.metrics.grossSales),200);assert.equal(Number(data.metrics.unitsSold),2);
      assert.equal(Number(data.metrics.confirmedPayments),200);assert.equal(Number(data.metrics.stockAvailable),2);
      assert.equal(Number(data.metrics.totalInvoices),1);
    });
    await t.test('closing releases unused reservations and retains sold history',async()=>{
      await schedule.updateSchedule(first.scheduleId,{status:'completed'});
      const [[row]]=await pool.query('SELECT * FROM flea_market_event_products WHERE schedule_id=?',[first.scheduleId]);
      assert.equal(row.sold_qty,2);assert.equal(row.released_qty,2);assert.equal(row.status,'released');
      assert.equal((await event.products(first.scheduleId,'',true)).length,1);
    });
    await t.test('schedule creation serializes conflicting location/date requests',async()=>{
      const create=()=>schedule.createSchedule({companyId:1,locationId:1,scheduledDate:'2099-01-03',createdBy:1});
      const outcomes=await Promise.allSettled([create(),create()]);
      assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
    });
    await t.test('validation failures do not strand checkout keys in processing',async()=>{
      const failedKey='integration_bad_event_0001';
      await assert.rejects(checkout.checkout(session,failedKey,items,{...options,scheduleId:next.scheduleId}),/not billable/);
      const [[row]]=await pool.query('SELECT status FROM flea_market_checkout_idempotency WHERE idempotency_key=?',[failedKey]);
      assert.equal(row.status,'failed');
    });
    await t.test('generated historical invoices do not count as confirmed collections',async()=>{
      await pool.query("INSERT INTO invoices(invoice_id,invoice_number,order_id,vendor_id,user_id,subtotal,grand_total,source,schedule_id) VALUES (34,'HISTORIC-34',34,1,1,50,50,'flea_market',?)",[first.scheduleId]);
      const data=await dashboard.summary({scheduleId:first.scheduleId});
      assert.equal(Number(data.metrics.grossSales),250);
      assert.equal(Number(data.metrics.confirmedPayments),200);
      assert.equal(Number(data.metrics.outstandingPayments),50);
    });
    await t.test('external vendors reuse legitimate identities and have no enabled login',async()=>{
      const added=await event.externalVendor(next.scheduleId,{email:'artisan@test.invalid',fullName:'Test Artisan',companyName:'Test Craft'},1);
      const [[user]]=await pool.query('SELECT u.password,u.is_verified FROM eusers u JOIN vendors v ON v.user_id=u.user_id WHERE v.vendor_id=?',[added.vendorId]);
      assert.equal(user.password,null);assert.equal(user.is_verified,0);
      const third=await schedule.createSchedule({companyId:1,locationId:1,scheduledDate:'2099-01-04',createdBy:1});
      const reused=await event.externalVendor(third.scheduleId,{email:'artisan@test.invalid',fullName:'Test Artisan',companyName:'Test Craft'},1);
      assert.equal(reused.vendorId,added.vendorId);
    });
    await t.test('unassigned products and unverified reward redemption fail without stock movement',async()=>{
      await pool.query("UPDATE flea_market_schedules SET scheduled_date='2099-01-01' WHERE schedule_id=?",[first.scheduleId]);
      const live=await schedule.createSchedule({companyId:1,locationId:1,scheduledDate:clock.today,createdBy:1});
      await pool.query("UPDATE flea_market_sessions SET status='active' WHERE session_id='test-session'");
      await event.addVendor(live.scheduleId,{vendorId:1,collectionModel:'reward_planners'},1);
      await assert.rejects(checkout.checkout(session,'unassigned_checkout_001',items,{...options,scheduleId:live.scheduleId}),/not assigned/);
      await event.assign(live.scheduleId,{poolId:1,assignedQty:2},1);
      const [rule]=await pool.query("INSERT INTO reward_rules(name,reward_type,reward_value,redemption_type,redemption_value,source_type) VALUES ('Test Rule','fixed',0,'fixed',10,'product')");
      await pool.query('INSERT INTO product_reward_settings(product_id,reward_rule_id,can_redeem_reward,is_active) VALUES (1,?,1,1)',[rule.insertId]);
      await pool.query('INSERT INTO customer_wallet(user_id,balance) VALUES (1,100) ON DUPLICATE KEY UPDATE balance=100');
      const rewardItems=[{variantId:1,qty:2,pointsApplied:10}];
      const rewardOptions={...options,scheduleId:live.scheduleId,payment:{method:'cash',amount:'190',confirmed:true}};
      await assert.rejects(checkout.checkout({...session,verified:false},'unverified_checkout_001',rewardItems,rewardOptions),/Verify the customer/);
      const [[before]]=await pool.query('SELECT sold_qty FROM flea_market_vendor_stock WHERE pool_id=1');assert.equal(before.sold_qty,2);
      const results=await Promise.allSettled([
        checkout.checkout(session,'concurrent_checkout_001',rewardItems,rewardOptions),
        checkout.checkout(session,'concurrent_checkout_002',rewardItems,rewardOptions),
      ]);
      assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
      const [[after]]=await pool.query('SELECT sold_qty,available_qty FROM flea_market_vendor_stock WHERE pool_id=1');
      assert.equal(after.sold_qty,4);assert.equal(after.available_qty,1);
      const [[wallet]]=await pool.query('SELECT balance FROM customer_wallet WHERE user_id=1');assert.equal(wallet.balance,90);
      const [[debits]]=await pool.query("SELECT COUNT(*) total FROM wallet_transactions WHERE transaction_type='debit'");assert.equal(debits.total,1);
    });
    await t.test('a mixed-collection cart generates vendor-specific invoices and payment records',async()=>{
      await pool.query("UPDATE flea_market_schedules SET scheduled_date='2099-01-05' WHERE scheduled_date=?",[clock.today]);
      const multi=await schedule.createSchedule({companyId:1,locationId:1,scheduledDate:clock.today,createdBy:1});
      await pool.query("INSERT INTO eusers(user_id,name,email,role,is_verified) VALUES (100,'Second Vendor','second@test.invalid','vendor',0)");
      await pool.query("INSERT INTO vendors(vendor_id,user_id,company_name,status) VALUES (100,100,'Second Vendor','approved')");
      await pool.query("INSERT INTO eproducts(product_id,vendor_id,product_name,status) VALUES (100,100,'Second Product','approved')");
      await pool.query("INSERT INTO product_variants(variant_id,product_id,sku,variant_attributes,mrp,sale_price,stock) VALUES (100,100,'TEST-100','{}',50,50,0)");
      await pool.query("INSERT INTO flea_market_vendor_stock(pool_id,vendor_id,product_id,variant_id,allocated_qty) VALUES (100,100,100,100,1)");
      await event.addVendor(multi.scheduleId,{vendorId:1,collectionModel:'reward_planners'},1);
      await event.addVendor(multi.scheduleId,{vendorId:100,collectionModel:'vendor'},1);
      await event.assign(multi.scheduleId,{poolId:1,assignedQty:1},1);
      await event.assign(multi.scheduleId,{poolId:100,assignedQty:1},1);
      await pool.query("INSERT INTO flea_market_sessions(session_id,user_id,company_id,location_id,expires_at) VALUES ('multi-session',1,1,1,DATE_ADD(NOW(),INTERVAL 1 HOUR))");
      const multiResult=await checkout.checkout({...session,sessionId:'multi-session'},'multi_vendor_checkout_001',[{variantId:1,qty:1,pointsApplied:0},{variantId:100,qty:1,pointsApplied:0}],{...options,scheduleId:multi.scheduleId,payment:{method:'cash',amount:'150',confirmed:true}});
      assert.equal(multiResult.invoices.length,2);
      const [payments]=await pool.query('SELECT recipient,amount FROM flea_market_payments WHERE checkout_key=? ORDER BY vendor_id',['multi_vendor_checkout_001']);
      assert.deepEqual(payments.map(p=>[p.recipient,Number(p.amount)]),[['reward_planners',100],['vendor',50]]);
      const data=await dashboard.summary({scheduleId:multi.scheduleId});
      assert.equal(Number(data.metrics.totalInvoices),2);assert.equal(Number(data.metrics.customerCheckouts),1);
      assert.equal(Number(data.metrics.grossSales),150);assert.equal(Number(data.metrics.unitsSold),2);
    });
    await t.test('Bus Booking migration repairs the inspected schema only in staging',async()=>{
      const [before]=await pool.query('SELECT * FROM invoices WHERE invoice_id=34');
      const [columns]=await pool.query('SHOW COLUMNS FROM busbooking_orders');
      assert.ok(columns.some(c=>c.Field==='booking_error'));
      assert.ok(columns.some(c=>c.Field==='booking_attempted_at'));
      assert.match(columns.find(c=>c.Field==='status').Type,/booking_review/);
      const [refunds]=await pool.query("SELECT id,razorpay_refund_id FROM busbooking_refunds WHERE status IN ('pending','initiated','failed') AND attempts < 8");
      assert.equal(refunds.length,0);
      const [after]=await pool.query('SELECT * FROM invoices WHERE invoice_id=34');
      assert.deepEqual(before,after);
      const booking=require('../../app/busboooking/services/bookingService');
      await booking.expireStaleBlocks();
      await booking.bookAbandonedPaidOrders();
      await booking.escalateStuckBookings();
      await require('../../app/busboooking/services/refundService').retryPendingRefunds();
    });
    await t.test('real HTTP CRM mounts, authentication, refresh, and event APIs',async()=>{
      const express=require('express');
      const jwt=require('jsonwebtoken');
      process.env.JWT_SECRET='integration-only-local-routing-test-secret';
      const password=await require('bcryptjs').hash('integration-test-password',4);
      await pool.execute('UPDATE eusers SET password=? WHERE user_id=1',[password]);
      const app=express();app.use(express.json());
      const crm=express.Router();crm.use('/auth',require('../../routes/auth'));
      require('../../routes/mountCrmRoutes')(app,crm,require('../routes/indexRoute'));
      app.use((req,res)=>res.status(404).json({success:false}));
      const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
      const base=`http://127.0.0.1:${server.address().port}`;
      try {
        assert.equal((await fetch(`${base}/api/crm/health`)).status,200);
        assert.equal((await fetch(`${base}/health`)).status,200);
        assert.equal((await fetch(`${base}/api/crm/api/crm/health`)).status,404);
        for (const endpoint of ['companies','schedules','dashboard/summary']) {
          assert.equal((await fetch(`${base}/api/crm/${endpoint}`)).status,401);
          const vendor=jwt.sign({user_id:2},process.env.JWT_SECRET);
          await pool.query('UPDATE eusers SET is_verified=1 WHERE user_id=2');
          assert.equal((await fetch(`${base}/api/crm/${endpoint}`,{headers:{Authorization:`Bearer ${vendor}`}})).status,403);
        }
        const login=await fetch(`${base}/api/crm/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'manager@test.invalid',password:'integration-test-password'})});
        assert.equal(login.status,200);
        const cookies=new Map();
        const merge=response=>{for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0];const index=pair.indexOf('=');cookies.set(pair.slice(0,index),pair.slice(index+1));}};
        merge(login);
        const cookieHeader=()=>[...cookies].map(([k,v])=>`${k}=${v}`).join('; ');
        cookies.set('rp_access_v2',jwt.sign({user_id:1,type:'access'},process.env.JWT_SECRET,{expiresIn:-1}));
        assert.equal((await fetch(`${base}/api/crm/auth/me`,{headers:{Cookie:cookieHeader()}})).status,401);
        const refresh=await fetch(`${base}/api/crm/auth/refresh`,{method:'POST',headers:{Cookie:cookieHeader(),'X-CSRF-Token':cookies.get('rp_csrf_v2')}});
        assert.equal(refresh.status,200);merge(refresh);
        assert.equal((await fetch(`${base}/api/crm/auth/me`,{headers:{Cookie:cookieHeader()}})).status,200);
        for(const endpoint of ['companies','schedules','dashboard/summary','vendors','vendor-stock']) {
          const response=await fetch(`${base}/api/crm/${endpoint}`,{headers:{Cookie:cookieHeader()}});
          assert.equal(response.status,200,endpoint);
          assert.equal((await response.json()).success,true);
        }
        const headers={Cookie:cookieHeader(),'X-CSRF-Token':cookies.get('rp_csrf_v2'),'Content-Type':'application/json'};
        const eventResponse=await fetch(`${base}/api/crm/schedules`,{method:'POST',headers,body:JSON.stringify({companyId:1,locationId:1,scheduledDate:'2099-02-01'})});
        assert.equal(eventResponse.status,201);
        const httpEvent=(await eventResponse.json()).data;
        const participant=await fetch(`${base}/api/crm/schedules/${httpEvent.scheduleId}/manage/vendors`,{method:'POST',headers,body:JSON.stringify({vendorId:1,collectionModel:'reward_planners'})});
        assert.equal(participant.status,200);
        const external=await fetch(`${base}/api/crm/schedules/${httpEvent.scheduleId}/manage/external-vendors`,{method:'POST',headers,body:JSON.stringify({companyName:'HTTP Artisan',fullName:'Artisan',email:'http-artisan@test.invalid'})});
        assert.equal(external.status,200);
        const externalVendor=(await external.json()).data;
        assert.equal((await fetch(`${base}/api/crm/products/catalog-search?vendor_id=1`,{headers})).status,200);
        assert.equal((await fetch(`${base}/api/crm/customers/search?company_id=1&q=Test`,{headers})).status,200);
        const product=await fetch(`${base}/api/crm/products`,{method:'POST',headers,body:JSON.stringify({vendorId:externalVendor.vendorId,productName:'HTTP Event Product',mrp:10,salePrice:5,initialStock:3})});
        assert.equal(product.status,201);
        const variant=(await product.json()).data;
        const stock=await fetch(`${base}/api/crm/vendor-stock`,{method:'POST',headers,body:JSON.stringify({vendorId:externalVendor.vendorId,variantId:variant.variantId,allocatedQty:2})});
        assert.equal(stock.status,201);
        const newPool=(await stock.json()).data;
        const assignment=await fetch(`${base}/api/crm/schedules/${httpEvent.scheduleId}/manage/products`,{method:'POST',headers,body:JSON.stringify({poolId:newPool.poolId,assignedQty:1,eventSellingPrice:'5.00'})});
        assert.equal(assignment.status,200);
        const billingHeaders={...headers,'X-Location-Id':'1','X-Schedule-Id':String(httpEvent.scheduleId)};
        const search=await fetch(`${base}/api/crm/products/search?q=HTTP`,{headers:billingHeaders});
        assert.equal(search.status,200);
        assert.equal((await search.json()).data[0].stock,1);
        const scan=await fetch(`${base}/api/crm/scan/${require('../utils/barcode').poolIdToBarcode(newPool.poolId)}`,{headers:billingHeaders});
        assert.equal(scan.status,200);
        const denied=await fetch(`${base}/api/crm/schedules`,{method:'POST',headers:{Cookie:cookieHeader(),'Content-Type':'application/json'},body:'{}'});
        assert.equal(denied.status,403,'CSRF protection remains enforced');
      } finally { await new Promise(resolve=>server.close(resolve)); }
    });
  } finally {
    if(pool) await pool.end();
    // This name was generated above and cannot equal the configured database.
    if (/^fm_test_\d+_\d+$/.test(scratch) && scratch!==source) await admin.query('DROP DATABASE IF EXISTS ??',[scratch]);
    await admin.end();
  }
});
