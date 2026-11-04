const db = require('../../config/database');
const { createError } = require('../utils/appError');

function positiveId(value, name) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw createError(400, `${name} must be a positive integer`);
  return n;
}

class EventAssignmentService {
  constructor(database = db) { this.db = database; }

  async transaction(work) {
    const conn = await this.db.getConnection();
    try {
      await conn.beginTransaction();
      const result = await work(conn);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      if (error.code === 'ER_DUP_ENTRY') throw createError(409, 'This event assignment already exists');
      throw error;
    } finally { conn.release(); }
  }

  async lockEvent(conn, scheduleId) {
    const [[event]] = await conn.execute('SELECT * FROM flea_market_schedules WHERE schedule_id = ? FOR UPDATE', [positiveId(scheduleId, 'scheduleId')]);
    if (!event) throw createError(404, 'Event not found');
    if (!['scheduled', 'in_progress'].includes(event.status)) throw createError(409, 'Event is closed');
    return event;
  }

  async vendors(scheduleId) {
    const [rows] = await this.db.execute(`SELECT ev.*, v.company_name, v.full_name FROM flea_market_event_vendors ev
      JOIN vendors v ON v.vendor_id = ev.vendor_id WHERE ev.schedule_id = ? ORDER BY ev.id`, [positiveId(scheduleId, 'scheduleId')]);
    return rows;
  }

  async addVendor(scheduleId, input, managerId) {
    return this.transaction(async conn => {
      await this.lockEvent(conn, scheduleId);
      const vendorId = positiveId(input.vendorId, 'vendorId');
      const [[vendor]] = await conn.execute("SELECT vendor_id FROM vendors WHERE vendor_id = ? AND status = 'approved'", [vendorId]);
      if (!vendor) throw createError(400, 'Select an approved vendor');
      const type = input.participationType || 'existing';
      const collection = input.collectionModel || 'unconfigured';
      if (!['existing','external'].includes(type) || !['unconfigured','reward_planners','vendor'].includes(collection)) throw createError(400, 'Invalid participation or collection model');
      const [result] = await conn.execute(`INSERT INTO flea_market_event_vendors
        (schedule_id,vendor_id,participation_type,collection_model,created_by) VALUES (?,?,?,?,?)`,
      [scheduleId,vendorId,type,collection,managerId]);
      return { id: result.insertId, vendorId };
    });
  }

  async externalVendor(scheduleId, input, managerId) {
    return this.transaction(async conn => {
      await this.lockEvent(conn,scheduleId);
      const email = String(input.email||'').trim().toLowerCase();
      const name = String(input.fullName||'').trim();
      const company = String(input.companyName||'').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>190 || !name || name.length>255 || !company || company.length>255 || String(input.phone||'').length>20) throw createError(400,'Valid email, fullName and companyName are required');
      const [[existing]] = await conn.execute('SELECT u.user_id,v.vendor_id,v.status FROM eusers u LEFT JOIN vendors v ON v.user_id=u.user_id WHERE u.email=? FOR UPDATE',[email]);
      if (existing?.vendor_id && existing.status!=='approved') throw createError(409,'Existing vendor must be approved before event participation');
      let vendorId = existing?.vendor_id;
      if (existing && !vendorId) throw createError(409,'This email belongs to an existing non-vendor account');
      if (!vendorId) {
        const [u] = await conn.execute("INSERT INTO eusers (name,role,email,phone,is_verified) VALUES (?,'vendor',?,?,0)",[name,email,input.phone||null]);
        const [v] = await conn.execute("INSERT INTO vendors (user_id,company_name,full_name,status,onboarding_flag) VALUES (?,?,?,'approved',1)",[u.insertId,company,name]);
        vendorId=v.insertId;
      }
      await conn.execute(`INSERT INTO flea_market_event_vendors (schedule_id,vendor_id,participation_type,created_by)
        VALUES (?,?,'external',?)`,[scheduleId,vendorId,managerId]);
      return {vendorId};
    });
  }

  async configureVendor(scheduleId,vendorId,collectionModel) {
    if (!['unconfigured','reward_planners','vendor'].includes(collectionModel)) throw createError(400,'Invalid collection model');
    return this.transaction(async conn=>{
      await this.lockEvent(conn,scheduleId);
      const [[paid]]=await conn.execute('SELECT payment_id FROM flea_market_payments WHERE schedule_id=? AND vendor_id=? LIMIT 1',[scheduleId,positiveId(vendorId,'vendorId')]);
      if (paid) throw createError(409,'Collection model cannot change after payment history exists');
      const [result]=await conn.execute('UPDATE flea_market_event_vendors SET collection_model=? WHERE schedule_id=? AND vendor_id=?',[collectionModel,scheduleId,vendorId]);
      if (!result.affectedRows) throw createError(404,'Participation not found or unchanged');
      return {updated:true};
    });
  }

  async deactivateVendor(scheduleId, vendorId) {
    return this.transaction(async conn => {
      await this.lockEvent(conn, scheduleId);
      const [[assigned]] = await conn.execute("SELECT id FROM flea_market_event_products WHERE schedule_id=? AND vendor_id=? AND status='active' LIMIT 1", [scheduleId,positiveId(vendorId,'vendorId')]);
      if (assigned) throw createError(409, 'Release this vendor’s active product assignments first');
      await conn.execute("UPDATE flea_market_event_vendors SET status='inactive' WHERE schedule_id=? AND vendor_id=?", [scheduleId,vendorId]);
      return { deactivated: true };
    });
  }

  async products(scheduleId, query = '', includeHistory = false) {
    const [rows] = await this.db.execute(`SELECT ep.*, p.product_name, p.brand_name, pv.sku, pv.mrp,
      COALESCE(ep.event_selling_price, fvs.allocation_price, pv.sale_price) sale_price,
      LEAST(ep.assigned_qty-ep.sold_qty-ep.released_qty,fvs.available_qty) available_qty,
      v.company_name vendor_name
      FROM flea_market_event_products ep
      JOIN flea_market_event_vendors ev ON ev.schedule_id=ep.schedule_id AND ev.vendor_id=ep.vendor_id
      JOIN flea_market_vendor_stock fvs ON fvs.pool_id=ep.pool_id
      JOIN eproducts p ON p.product_id=ep.product_id
      JOIN product_variants pv ON pv.variant_id=ep.variant_id
      JOIN vendors v ON v.vendor_id=ep.vendor_id
      WHERE ep.schedule_id=? ${includeHistory ? '' : "AND ep.status='active' AND ev.status='active' AND fvs.status='active' AND p.status='approved' AND p.is_deleted=0 AND pv.is_visible=1"}
        AND (p.product_name LIKE ? OR pv.sku LIKE ?)
      ORDER BY ep.id`, [positiveId(scheduleId,'scheduleId'),`%${query}%`,`%${query}%`]);
    return rows;
  }

  async assign(scheduleId, input, managerId) {
    return this.transaction(async conn => {
      await this.lockEvent(conn,scheduleId);
      const poolId = positiveId(input.poolId,'poolId');
      const qty = positiveId(input.assignedQty,'assignedQty');
      const price = input.eventSellingPrice == null || input.eventSellingPrice === '' ? null : Number(input.eventSellingPrice);
      if (price !== null && (!Number.isFinite(price) || price < 0 || price > 99999999.99 || Math.abs(price*100-Math.round(price*100)) > 0.00001)) throw createError(400,'Invalid event selling price');
      // The shared pool lock serializes reservations across different events.
      const [[pool]] = await conn.execute('SELECT * FROM flea_market_vendor_stock WHERE pool_id=? FOR UPDATE',[poolId]);
      if (!pool || pool.status !== 'active') throw createError(400,'Active stock pool required');
      const [[owner]] = await conn.execute(`SELECT ep.vendor_id FROM eproducts ep JOIN product_variants pv ON pv.product_id=ep.product_id
        WHERE ep.product_id=? AND pv.variant_id=? AND ep.vendor_id=?`,[pool.product_id,pool.variant_id,pool.vendor_id]);
      if (!owner) throw createError(409,'Pool/product/vendor ownership does not match');
      const [[vendor]] = await conn.execute("SELECT id FROM flea_market_event_vendors WHERE schedule_id=? AND vendor_id=? AND status='active'",[scheduleId,pool.vendor_id]);
      if (!vendor) throw createError(400,'Vendor must participate in this event first');
      const [[reserved]] = await conn.execute(`SELECT COALESCE(SUM(assigned_qty-sold_qty-released_qty),0) qty
        FROM flea_market_event_products WHERE pool_id=? AND status='active'`,[poolId]);
      if (qty > Number(pool.available_qty)-Number(reserved.qty)) throw createError(409,'Quantity exceeds unreserved pool inventory');
      const [result] = await conn.execute(`INSERT INTO flea_market_event_products
        (schedule_id,vendor_id,product_id,variant_id,pool_id,assigned_qty,event_selling_price,created_by) VALUES (?,?,?,?,?,?,?,?)`,
      [scheduleId,pool.vendor_id,pool.product_id,pool.variant_id,poolId,qty,price,managerId]);
      return { id:result.insertId };
    });
  }

  async release(scheduleId, assignmentId) {
    return this.transaction(async conn => {
      await this.lockEvent(conn,scheduleId);
      const [[row]] = await conn.execute('SELECT * FROM flea_market_event_products WHERE id=? AND schedule_id=?',[positiveId(assignmentId,'assignmentId'),scheduleId]);
      if (!row) throw createError(404,'Assignment not found');
      await conn.execute('SELECT pool_id FROM flea_market_vendor_stock WHERE pool_id=? FOR UPDATE',[row.pool_id]);
      await conn.execute("UPDATE flea_market_event_products SET released_qty=assigned_qty-sold_qty,status='released' WHERE id=?",[row.id]);
      return { released:true };
    });
  }
}
module.exports = new EventAssignmentService();
module.exports.EventAssignmentService = EventAssignmentService;
module.exports.positiveId = positiveId;
