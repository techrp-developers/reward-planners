// Opt-in integration test. All fixture tables are session-local TEMPORARY tables
// that shadow the real names; no persistent table or customer row is modified.
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('path');
const {createWorkspaceModel}=require('../models/managerWorkspaceModel');
test('MySQL summaries and catalogue queries isolate unclassified/partner rows and preserve price history', {skip:process.env.SERVICE_MANAGER_DB_TEST!=='true'},async()=>{
  require('dotenv').config({path:path.resolve(__dirname,'../../../../.env'),quiet:true});
  const host=process.env.DB_HOST||'localhost';
  assert.ok(['localhost','127.0.0.1','::1'].includes(host),'Integration test requires local MySQL');
  const conn=await require('mysql2/promise').createConnection({host,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'rewardplanners_db',dateStrings:true});
  const tables={
    service_categories:'id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(100),service_scope VARCHAR(20),status INT,description TEXT,sort_order INT,icon VARCHAR(255),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    services:'id INT AUTO_INCREMENT PRIMARY KEY,category_id INT,name VARCHAR(255),description TEXT,service_image VARCHAR(255),sort_order INT,is_featured INT,service_scope VARCHAR(20),price DECIMAL(10,2),estimated_days INT,status INT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    service_variants:'id INT AUTO_INCREMENT PRIMARY KEY,service_id INT,variant_name VARCHAR(255),title VARCHAR(255),short_description TEXT,image_url VARCHAR(500),price DECIMAL(10,2),original_price DECIMAL(10,2),status INT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    service_orders:'id INT PRIMARY KEY,service_id INT,parent_order_id VARCHAR(36),order_ref VARCHAR(50),status VARCHAR(50),payment_status VARCHAR(20),price DECIMAL(10,2),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    service_enquiries:'id INT PRIMARY KEY,service_id INT,bundle_id INT,enquiry_ref VARCHAR(50),name VARCHAR(255),status VARCHAR(30),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    service_bundle_items:'id INT,service_id INT,bundle_id INT',
    service_documents:'id INT AUTO_INCREMENT PRIMARY KEY,service_id INT,document_name VARCHAR(255),document_key VARCHAR(100),is_mandatory INT,is_expirable INT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    service_order_cancellations:'id INT,service_order_id INT,status VARCHAR(30),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    wallet_transactions:'transaction_id INT,reference_id INT,reason_code VARCHAR(50),transaction_type VARCHAR(20),coins INT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    service_manager_audit_logs:'id INT AUTO_INCREMENT PRIMARY KEY,actor_id INT,service_scope VARCHAR(20),entity_type VARCHAR(40),entity_id INT,action VARCHAR(60),reason VARCHAR(500),before_json JSON,after_json JSON,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    eusers:'user_id INT,name VARCHAR(100)',
  };
  // Never use a pool: all operations must stay in the same temporary-table session.
  const db={execute:(...args)=>conn.execute(...args),getConnection:async()=>({execute:(...args)=>conn.execute(...args),beginTransaction:()=>conn.beginTransaction(),commit:()=>conn.commit(),rollback:()=>conn.rollback(),release:()=>{}})};
  try{
    for(const [table,columns]of Object.entries(tables))await conn.query(`CREATE TEMPORARY TABLE ${table} (${columns}) ENGINE=InnoDB`);
    await conn.query("INSERT INTO eusers VALUES (35,'Test Manager')");
    await conn.query("INSERT INTO service_categories (id,name,service_scope,status) VALUES (1,'Internal','in_house',1),(2,'Partner','partner',1),(3,'Legacy',NULL,1)");
    await conn.query("INSERT INTO services (id,category_id,name,service_scope,price,estimated_days,status) VALUES (1,1,'Internal','in_house',500,7,1),(2,2,'Partner','partner',900,7,1),(3,3,'Legacy',NULL,200,7,1)");
    await conn.query("INSERT INTO service_variants (id,service_id,variant_name,price,original_price,status) VALUES (1,1,'Internal standard',500,600,1),(2,2,'Partner standard',900,1000,1)");
    await conn.query("INSERT INTO service_orders (id,service_id,parent_order_id,order_ref,status,payment_status,price) VALUES (1,1,'p1','IN-1','completed','paid',450.25),(2,2,'p2','PARTNER-2','completed','paid',900),(3,3,'p3','LEGACY-3','completed','paid',200),(4,1,'p4','IN-4','completed','pending',500)");
    await conn.query("INSERT INTO service_enquiries (id,service_id,bundle_id,enquiry_ref,name,status) VALUES (1,1,NULL,'E1','Test','new'),(2,2,NULL,'E2','Test','new'),(3,NULL,7,'E3','Test','new'),(4,NULL,8,'E4','Test','new')");
    await conn.query('INSERT INTO service_bundle_items VALUES (1,1,7),(2,1,8),(3,2,8)');
    await conn.query("INSERT INTO wallet_transactions (reference_id,reason_code,transaction_type,coins) VALUES (1,'SERVICE_REWARD','credit',20),(2,'SERVICE_REWARD','credit',99),(1,'ORDER_REWARD','credit',100)");
    await conn.query("INSERT INTO service_orders (id,service_id,parent_order_id,order_ref,status,payment_status,price) VALUES (5,1,'p5','IN-5','in_progress','paid',300)");
    const model=createWorkspaceModel(db);
    const summary=await model.summary({});
    assert.equal(Number(summary.metrics.revenue),450.25);
    assert.equal(Number(summary.metrics.pending_enquiries),2,'Mixed-scope bundle must be excluded');
    assert.equal(Number(summary.metrics.coins_issued),20,'Potential rewards and other module credits must not count');
    assert.equal(Number(summary.metrics.unclassified_services),1);
    const list=await model.list('variants',{});
    assert.equal(list.rows.length,1);assert.equal(list.rows[0].service_name,'Internal');
    await model.commercial(1,{price:'400.10',original_price:'600',version:list.rows[0].version,reason:'Integration verification'},35,'pricing');
    const [[snapshot]]=await conn.execute('SELECT price FROM service_orders WHERE id=1');
    assert.equal(snapshot.price,'450.25','Historical order price remains immutable');
    const history=await model.history({action:'pricing'});
    assert.equal(history.rows.length,1);assert.equal(history.rows[0].actor_name,'Test Manager');
    assert.equal((await model.list('categories',{scope:'unclassified'})).rows[0].name,'Legacy');
    const empty=await model.summary({from:'2000-01-01',to:'2000-01-02'});
    assert.equal(Number(empty.metrics.revenue),0);
    const requirement={document_name:'Identity proof',document_key:'identity_proof',is_mandatory:1,is_expirable:0,reason:'Initial fulfilment requirements'};
    await assert.rejects(model.saveDocument(1,null,requirement,35),error=>error.status===409,'Active order requirements must not change');
    await conn.query("INSERT INTO services (id,category_id,name,service_scope,price,estimated_days,status) VALUES (4,1,'New internal','in_house',500,7,1)");
    await model.saveDocument(4,null,requirement,35);
    assert.equal((await model.documents(4)).rows[0].document_name,'Identity proof');
    await assert.rejects(model.saveDocument(4,null,requirement,35),error=>error.status===409,'Duplicate document keys must be rejected');
    await assert.rejects(model.documents(2),error=>error.status===404,'Partner requirements must be inaccessible');
    const category=await model.save('categories',null,{name:'New category',description:'Test description',status:1,sort_order:2,reason:'Create category'},35);
    const service=await model.save('services',null,{category_id:category.id,name:'New service',description:'Service description',price:'250.15',status:1,estimated_days:3,reason:'Create service'},35);
    const option=await model.save('variants',null,{service_id:service.id,variant_name:'New variant',title:'Standard',price:'250.15',status:1,reason:'Create variant'},35);
    assert.equal(option.price,'250.15');
    const listed=(await model.list('categories',{search:'New category'})).rows[0];
    await model.save('categories',category.id,{...listed,status:0,reason:'Deactivate category'},35);
    assert.equal((await model.list('categories',{search:'New category',status:0})).rows[0].status,0,'Inactive records must be recoverable through management reads');
    await conn.query("SET time_zone='+05:30'");
    await conn.query("UPDATE service_orders SET created_at='2001-11-01 04:00:00' WHERE id=1");
    assert.equal(Number((await model.summary({from:'2001-10-31',to:'2001-10-31'})).metrics.revenue),450.25,'UTC date filters must include the previous UTC day in a non-UTC session');
    assert.equal(Number((await model.summary({from:'2001-11-01',to:'2001-11-01'})).metrics.revenue),0);
  }finally{await conn.end();}
});
