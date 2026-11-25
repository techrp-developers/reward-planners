const P = require('../utils/managerPolicy');

const ENTITIES = {
  categories: { table: 'service_categories', alias: 'c', fields: ['name','description','sort_order','status','icon','service_scope'] },
  services: { table: 'services', alias: 's', fields: ['category_id','name','description','price','estimated_days','sort_order','is_featured','status','service_image','service_scope'] },
  variants: { table: 'service_variants', alias: 'v', fields: ['service_id','variant_name','title','short_description','price','status','image_url'] },
};
function utcRow(row) {
  const result={...row};
  for(const field of ['created_at','updated_at']){
    const epoch=result[`${field}_epoch`];
    if(epoch!=null)result[field]=new Date(Number(epoch)*1000).toISOString();
    delete result[`${field}_epoch`];
  }
  return result;
}
function createWorkspaceModel(db) {
  async function ready() {
    const [rows] = await db.execute(`SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() AND ((TABLE_NAME IN ('services','service_categories') AND COLUMN_NAME='service_scope')
      OR (TABLE_NAME='service_manager_audit_logs' AND COLUMN_NAME='after_json'))`);
    if (rows.length !== 3) throw P.invalid('Service workspace migration is required. Ask your administrator to review migration 20261117_01.', 503);
  }
  async function transaction(work) {
    const conn = await db.getConnection();
    try { await conn.beginTransaction(); const result = await work(conn); await conn.commit(); return result; }
    catch (error) { await conn.rollback(); throw error; }
    finally { conn.release(); }
  }
  async function audit(conn, actor, kind, recordId, action, reason, before, after) {
    await conn.execute(`INSERT INTO service_manager_audit_logs
      (actor_id,service_scope,entity_type,entity_id,action,reason,before_json,after_json)
      VALUES (?,'in_house',?,?,?,?,?,?)`, [actor,kind,recordId,action,reason, before ? JSON.stringify(before) : null, JSON.stringify(after)]);
  }
  async function record(conn, kind, recordId) {
    const entity = ENTITIES[kind];
    if (!entity) throw P.invalid('Unknown catalogue type.');
    const [[row]] = await conn.execute(`SELECT * FROM ${entity.table} WHERE id=? FOR UPDATE`, [recordId]);
    if (!row) throw P.invalid('Record not found.', 404);
    if (kind === 'variants') {
      const [[parent]] = await conn.execute('SELECT service_scope FROM services WHERE id=? FOR UPDATE', [row.service_id]);
      if (parent?.service_scope !== 'in_house') throw P.invalid('This variant is outside the In-House workspace.',403);
    } else if (row.service_scope !== 'in_house' && row.service_scope !== null) throw P.invalid('This record is outside the In-House workspace.',403);
    return row;
  }
  async function parent(conn, kind, data) {
    const table = kind === 'services' ? 'service_categories' : 'services';
    const parentId = data[kind === 'services' ? 'category_id' : 'service_id'];
    const [[row]] = await conn.execute(`SELECT id,service_scope FROM ${table} WHERE id=? FOR UPDATE`, [parentId]);
    if (!row || row.service_scope !== 'in_house') throw P.invalid('Select a parent from the In-House workspace.');
  }
  async function list(kind, query) {
    const e = ENTITIES[kind]; if (!e) throw P.invalid('Unknown catalogue type.');
    const { page, limit } = P.page(query), args = [], conditions = [];
    if (query.scope && !['in_house','unclassified'].includes(query.scope)) throw P.invalid('Unsupported catalogue scope.');
    const scope = query.scope === 'unclassified' ? 'IS NULL' : "= 'in_house'";
    const joins = kind === 'services' ? 'LEFT JOIN service_categories c ON c.id=s.category_id' : kind === 'variants' ? 'JOIN services s ON s.id=v.service_id' : '';
    conditions.push(`${kind === 'variants' ? 's' : e.alias}.service_scope ${scope}`);
    if (query.search) { conditions.push(`${e.alias}.${kind === 'variants' ? 'variant_name' : 'name'} LIKE ?`); args.push(`%${P.text(query.search,'Search',100)}%`); }
    if (query.status !== undefined && query.status !== '') { conditions.push(`${e.alias}.status=?`); args.push(P.status(query.status)); }
    const filter = kind === 'services' ? 'category_id' : kind === 'variants' ? 'service_id' : null;
    if (filter && query[filter]) { conditions.push(`${e.alias}.${filter}=?`); args.push(P.id(query[filter])); }
    const where = conditions.join(' AND ');
    const [[count]] = await db.execute(`SELECT COUNT(*) AS total FROM ${e.table} ${e.alias} ${joins} WHERE ${where}`,args);
    const extra = kind === 'categories' ? `, (SELECT COUNT(*) FROM services s WHERE s.category_id=c.id AND s.service_scope <=> c.service_scope) AS service_count`
      : kind === 'services' ? `, c.name AS category_name, (SELECT COUNT(*) FROM service_variants v WHERE v.service_id=s.id) AS variant_count,
      (SELECT MIN(v.price) FROM service_variants v WHERE v.service_id=s.id AND v.status=1) AS price_from`
      : ', s.name AS service_name';
    const sort = query.sort === 'name' ? `${e.alias}.${kind === 'variants' ? 'variant_name' : 'name'} ASC` : `${e.alias}.id DESC`;
    const epochs=`, UNIX_TIMESTAMP(${e.alias}.created_at) AS created_at_epoch${kind!=='variants'?`,UNIX_TIMESTAMP(${e.alias}.updated_at) AS updated_at_epoch`:''}`;
    const [rows] = await db.execute(`SELECT ${e.alias}.* ${extra} ${epochs} FROM ${e.table} ${e.alias} ${joins} WHERE ${where} ORDER BY ${sort} LIMIT ${limit} OFFSET ${(page-1)*limit}`,args);
    const computed = ['service_count','category_name','variant_count','price_from','service_name','created_at_epoch','updated_at_epoch'];
    return { rows: rows.map(row => ({ ...utcRow(row), version: JSON.stringify(Object.fromEntries(Object.entries(row).filter(([key])=>!computed.includes(key)))) })), total: Number(count.total), page, limit };
  }
  async function save(kind, recordId, body, actor, uploadPath) {
    const e = ENTITIES[kind]; if (!e) throw P.invalid('Unknown catalogue type.');
    const reason = P.text(body.reason,'Change reason',500);
    return transaction(async conn => {
      const before = recordId ? await record(conn,kind,recordId) : null;
      if (before && (!body.version || String(body.version) !== JSON.stringify(before))) throw P.invalid('This record changed. Refresh before saving.',409);
      const data = { status: P.status(body.status ?? before?.status ?? 1) };
      if (kind === 'categories') Object.assign(data, { name: P.text(body.name,'Category name',100), description: P.text(body.description,'Description',5000,false), sort_order:P.integer(body.sort_order ?? 0) });
      if (kind === 'services') Object.assign(data, { category_id:P.id(body.category_id), name:P.text(body.name,'Service name'), description:P.text(body.description,'Description',20000,false), price: before?.price ?? P.money(body.price ?? '0'), estimated_days:P.integer(body.estimated_days ?? 0,3650), sort_order:P.integer(body.sort_order ?? 0), is_featured:P.status(body.is_featured ?? 0) });
      if (kind === 'variants') Object.assign(data, { service_id:P.id(body.service_id), variant_name:P.text(body.variant_name,'Variant name'), title:P.text(body.title,'Title'), short_description:P.text(body.short_description,'Description',5000,false), price:before?.price ?? P.money(body.price ?? '0') });
      if (kind !== 'categories') await parent(conn,kind,data);
      // Moving a historical variant to a different service corrupts order context.
      if (before && kind === 'variants' && Number(before.service_id) !== data.service_id) throw P.invalid('A variant cannot be moved to another service. Create a new variant.');
      if (kind !== 'variants') {
        data.service_scope = 'in_house';
        if (before?.service_scope === null) {
          if (body.classify !== 'in_house') throw P.invalid('Explicitly confirm In-House classification.');
          // Classification of existing records is explicit, not an automatic backfill.
        }
      }
      const imageField = kind === 'categories' ? 'icon' : kind === 'services' ? 'service_image' : 'image_url';
      if (uploadPath) data[imageField]=uploadPath;
      const keys = Object.keys(data).filter(key => e.fields.includes(key));
      let savedId=recordId;
      if (recordId) await conn.execute(`UPDATE ${e.table} SET ${keys.map(key=>`${key}=?`).join(',')} WHERE id=?`,[...keys.map(key=>data[key]),recordId]);
      else { const [result]=await conn.execute(`INSERT INTO ${e.table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,keys.map(key=>data[key])); savedId=result.insertId; }
      const [[after]]=await conn.execute(`SELECT * FROM ${e.table} WHERE id=?`,[savedId]);
      await audit(conn,actor,kind,savedId,before?'updated':'created',reason,before,after);
      return after;
    });
  }
  async function commercial(recordId, body, actor, mode) {
    const reason=P.text(body.reason,'Change reason',500);
    const data=mode==='pricing' ? P.price(body) : P.rewards(body);
    if (mode==='rewards' && (data.can_earn_reward || data.can_redeem_reward)) {
      // Preserve existing policy. New conversion assumptions must be approved.
      if (body.policy_acknowledged !== true) throw P.invalid('Confirm the existing reward policy before saving.');
      const [[column]]=await db.execute(`SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wallet_transactions' AND COLUMN_NAME='reason_code'`);
      if (!column?.COLUMN_TYPE.includes("'SERVICE_REWARD'")) throw P.invalid('Reward activation is blocked: the wallet schema does not support SERVICE_REWARD. Administrator review required.',409);
    }
    return transaction(async conn=>{
      const before=await record(conn,'variants',recordId);
      if (!body.version || body.version !== JSON.stringify(before)) throw P.invalid('This variant changed. Refresh before saving.',409);
      if(mode==='rewards' && ((data.can_earn_reward>Number(before.can_earn_reward||0)) || (data.can_redeem_reward>Number(before.can_redeem_reward||0))
        || (data.can_earn_reward && data.earn_reward_type!==before.earn_reward_type) || (data.can_redeem_reward && data.redemption_type!==before.redemption_type))) {
        throw P.invalid('New reward activations and reward-type changes are disabled until financial policy review. Existing enabled rules may be adjusted or disabled.',409);
      }
      const keys=Object.keys(data);
      await conn.execute(`UPDATE service_variants SET ${keys.map(key=>`${key}=?`).join(',')} WHERE id=?`,[...keys.map(key=>data[key]),recordId]);
      const after={...before,...data};
      await audit(conn,actor,'variants',recordId,mode,reason,before,after);
      return after;
    });
  }
  async function history(query) {
    const {page,limit}=P.page(query), args=[], where=["a.service_scope='in_house'"];
    if(query.entity_id){where.push('a.entity_id=?');args.push(P.id(query.entity_id));}
    if(query.entity_type){where.push('a.entity_type=?');args.push(P.text(query.entity_type,'Entity type',40));}
    if(query.action){where.push('a.action=?');args.push(P.text(query.action,'Action',60));}
    const [[count]]=await db.execute(`SELECT COUNT(*) AS total FROM service_manager_audit_logs a WHERE ${where.join(' AND ')}`,args);
    const [rows]=await db.execute(`SELECT a.*,u.name AS actor_name,UNIX_TIMESTAMP(a.created_at) AS created_at_epoch FROM service_manager_audit_logs a LEFT JOIN eusers u ON u.user_id=a.actor_id
      WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT ${limit} OFFSET ${(page-1)*limit}`,args);
    return {rows:rows.map(utcRow),total:Number(count.total),page,limit};
  }
  async function summary(query) {
    const {from,to}=P.dates(query);
    // Epoch bounds ensure UTC date ranges even when a legacy DB session uses SYSTEM timezone.
    const range=(alias)=>({sql:`${from?` AND UNIX_TIMESTAMP(${alias}.created_at)>=?`:''}${to?` AND UNIX_TIMESTAMP(${alias}.created_at)<?`:''}`,args:[...(from?[Date.parse(`${from}T00:00:00Z`)/1000]:[]),...(to?[Date.parse(`${to}T00:00:00Z`)/1000+86400]:[])]});
    const orderRange=range('o'), enquiryRange=range('e'), cancelRange=range('x'), walletRange=range('w');
    // Financial aggregation uses DECIMAL in MySQL; string results are retained.
    const [[catalogue]]=await db.execute(`SELECT
      (SELECT COUNT(*) FROM service_categories WHERE service_scope='in_house') AS categories,
      (SELECT COUNT(*) FROM services WHERE service_scope='in_house') AS services,
      (SELECT COUNT(*) FROM services WHERE service_scope='in_house' AND status=1) AS active_services,
      (SELECT COUNT(*) FROM services WHERE service_scope='partner') AS partner_services,
      (SELECT COUNT(*) FROM services WHERE service_scope IS NULL) AS unclassified_services,
      (SELECT COUNT(*) FROM service_variants v JOIN services s ON s.id=v.service_id WHERE s.service_scope='in_house' AND v.status=1) AS active_variants`);
    const [[orders]]=await db.execute(`SELECT COUNT(*) AS orders,
      COALESCE(SUM(o.status IN ('payment_done','documents_pending','documents_uploaded','in_progress')),0) AS active_orders,
      COALESCE(SUM(o.status='completed'),0) AS completed_orders,
      COALESCE(SUM(CASE WHEN o.status='completed' AND o.payment_status='paid' THEN o.price ELSE 0 END),0) AS revenue,
      COALESCE(SUM(o.status IN ('documents_pending','documents_uploaded','in_progress') AND s.estimated_days>0 AND UNIX_TIMESTAMP(o.created_at)<UNIX_TIMESTAMP()-s.estimated_days*86400),0) AS delayed_orders
      FROM service_orders o JOIN services s ON s.id=o.service_id WHERE s.service_scope='in_house'${orderRange.sql}`,orderRange.args);
    const [[enquiries]]=await db.execute(`SELECT COUNT(*) AS pending_enquiries FROM service_enquiries e
      WHERE ${enquiryScope('e')} AND e.status IN ('new','contacted')${enquiryRange.sql}`,enquiryRange.args);
    const [[cancellations]]=await db.execute(`SELECT COALESCE(SUM(x.status='requested'),0) AS pending_cancellations
      FROM service_order_cancellations x JOIN service_orders o ON o.id=x.service_order_id JOIN services s ON s.id=o.service_id
      WHERE s.service_scope='in_house'${cancelRange.sql}`,cancelRange.args);
    const [[issued]]=await db.execute(`SELECT COALESCE(SUM(w.coins),0) AS coins_issued FROM wallet_transactions w
      JOIN service_orders o ON o.id=w.reference_id JOIN services s ON s.id=o.service_id
      WHERE s.service_scope='in_house' AND w.reason_code='SERVICE_REWARD' AND w.transaction_type='credit'${walletRange.sql}`,walletRange.args);
    const [performance]=await db.execute(`SELECT o.status,COUNT(*) AS total FROM service_orders o JOIN services s ON s.id=o.service_id WHERE s.service_scope='in_house'${orderRange.sql} GROUP BY o.status`,orderRange.args);
    const [trend]=await db.execute(`SELECT DATE_FORMAT(TIMESTAMPADD(SECOND,UNIX_TIMESTAMP(o.created_at),'1970-01-01 00:00:00'),'%Y-%m') AS month,SUM(o.price) AS amount FROM service_orders o JOIN services s ON s.id=o.service_id
      WHERE s.service_scope='in_house' AND o.status='completed' AND o.payment_status='paid'${orderRange.sql} GROUP BY month ORDER BY month DESC LIMIT 12`,orderRange.args);
    const [top]=await db.execute(`SELECT s.id,s.name,COUNT(*) AS completed_orders,SUM(o.price) AS amount FROM service_orders o JOIN services s ON s.id=o.service_id
      WHERE s.service_scope='in_house' AND o.status='completed' AND o.payment_status='paid'${orderRange.sql} GROUP BY s.id,s.name ORDER BY completed_orders DESC LIMIT 5`,orderRange.args);
    const [recentOrders]=await db.execute(`SELECT o.id,o.parent_order_id,o.order_ref,o.status,o.price,o.created_at,UNIX_TIMESTAMP(o.created_at) AS created_at_epoch,s.name AS service_name FROM service_orders o JOIN services s ON s.id=o.service_id
      WHERE s.service_scope='in_house'${orderRange.sql} ORDER BY o.id DESC LIMIT 6`,orderRange.args);
    const [recentEnquiries]=await db.execute(`SELECT e.id,e.enquiry_ref,e.name,e.status,e.created_at,UNIX_TIMESTAMP(e.created_at) AS created_at_epoch FROM service_enquiries e WHERE ${enquiryScope('e')} AND e.status IN ('new','contacted')${enquiryRange.sql} ORDER BY e.id DESC LIMIT 5`,enquiryRange.args);
    const [recentServices]=await db.execute(`SELECT id,name,status,created_at,UNIX_TIMESTAMP(created_at) AS created_at_epoch FROM services WHERE service_scope='in_house' ORDER BY id DESC LIMIT 5`);
    const activity=await history({limit:6});
    return {metrics:{...catalogue,...orders,...enquiries,...cancellations,...issued}, performance,trend:trend.reverse(),top,recentOrders:recentOrders.map(utcRow),recentEnquiries:recentEnquiries.map(utcRow),recentServices:recentServices.map(utcRow),activity:activity.rows,
      definitions:{revenue:'Paid completed service item value, grouped by order creation date; includes redeemed value, excludes cancelled items. Not net receipts or profit.',coins:'Actual SERVICE_REWARD wallet credits in the selected period.',dates:'UTC creation dates; catalogue counts and activity are current.'}};
  }
  async function enquiryStatus(recordId,status,actor) {
    return transaction(async conn=>{
      const [[before]]=await conn.execute(`SELECT e.id,e.status FROM service_enquiries e WHERE e.id=? AND ${enquiryScope('e')} FOR UPDATE`,[recordId]);
      if(!before)throw P.invalid('In-House enquiry not found.',404);
      if(before.status!==status){await conn.execute('UPDATE service_enquiries SET status=? WHERE id=?',[status,recordId]);await audit(conn,actor,'enquiries',recordId,'status','Manager enquiry status update',before,{id:recordId,status});}
      return {affectedRows:1};
    });
  }
  async function documents(serviceId) {
    const [[service]]=await db.execute("SELECT id,name FROM services WHERE id=? AND service_scope='in_house'",[serviceId]);
    if(!service)throw P.invalid('In-House service not found.',404);
    const [rows]=await db.execute('SELECT * FROM service_documents WHERE service_id=? ORDER BY id',[serviceId]);
    return {service,rows};
  }
  async function saveDocument(serviceId,documentId,body,actor) {
    return transaction(async conn=>{
      const service=await record(conn,'services',serviceId);
      if(service.service_scope!=='in_house')throw P.invalid('Classify this service before configuring documents.',409);
      const [[active]]=await conn.execute("SELECT id FROM service_orders WHERE service_id=? AND status NOT IN ('completed','cancelled') LIMIT 1 FOR UPDATE",[serviceId]);
      if(active)throw P.invalid('Document requirements are locked while this service has active orders. Existing customer requirements must be preserved.',409);
      let before=null;
      if(documentId){[[before]]=await conn.execute('SELECT * FROM service_documents WHERE id=? AND service_id=? FOR UPDATE',[documentId,serviceId]);if(!before)throw P.invalid('Document requirement not found.',404);}
      const key=before?.document_key||P.text(body.document_key,'Document key',100);
      if(!/^[a-z][a-z0-9_]{0,99}$/.test(key))throw P.invalid('Document key must start with a letter and contain lowercase letters, numbers or underscores.');
      const [[duplicate]]=await conn.execute('SELECT id FROM service_documents WHERE service_id=? AND document_key=? AND id<>? LIMIT 1',[serviceId,key,documentId||0]);
      if(duplicate)throw P.invalid('This document key already exists for the service.',409);
      const data={document_name:P.text(body.document_name,'Document name'),document_key:key,is_mandatory:P.status(body.is_mandatory),is_expirable:P.status(body.is_expirable)};
      const reason=P.text(body.reason,'Change reason',500);
      let savedId=documentId;
      if(documentId)await conn.execute('UPDATE service_documents SET document_name=?,is_mandatory=?,is_expirable=? WHERE id=?',[data.document_name,data.is_mandatory,data.is_expirable,documentId]);
      else {const [result]=await conn.execute('INSERT INTO service_documents (service_id,document_name,document_key,is_mandatory,is_expirable) VALUES (?,?,?,?,?)',[serviceId,data.document_name,key,data.is_mandatory,data.is_expirable]);savedId=result.insertId;}
      await audit(conn,actor,'documents',savedId,before?'updated':'created',reason,before,{...data,service_id:serviceId});
      return {id:savedId,...data};
    });
  }
  return {ready,list,save,commercial,history,summary,enquiryStatus,documents,saveDocument};
}
// Bundle enquiries are in-house only when every bundle item is classified in-house.
function enquiryScope(alias='e') { return `(EXISTS (SELECT 1 FROM services sm_s WHERE sm_s.id=${alias}.service_id AND sm_s.service_scope='in_house') OR
  (${alias}.service_id IS NULL AND ${alias}.bundle_id IS NOT NULL AND EXISTS (SELECT 1 FROM service_bundle_items bi WHERE bi.bundle_id=${alias}.bundle_id)
  AND NOT EXISTS (SELECT 1 FROM service_bundle_items bi LEFT JOIN services bs ON bs.id=bi.service_id WHERE bi.bundle_id=${alias}.bundle_id AND (bs.service_scope IS NULL OR bs.service_scope<>'in_house'))))`; }
module.exports={createWorkspaceModel,enquiryScope};
