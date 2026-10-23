const db = require('../../config/database');
const { createError } = require('../utils/appError');
const { positiveId } = require('./eventAssignmentService');

function filters(input) {
  const clauses = []; const params = [];
  for (const [key,column] of [['companyId','company_id'],['scheduleId','schedule_id']]) {
    if (input[key] !== undefined && input[key] !== '') { clauses.push(`fs.${column}=?`); params.push(positiveId(input[key],key)); }
  }
  for (const [key,operator] of [['fromDate','>='],['toDate','<=']]) {
    const date = input[key];
    if (date !== undefined && date !== '') {
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date) throw createError(400,`Invalid ${key}`);
      clauses.push(`fs.scheduled_date ${operator} ?`); params.push(date);
    }
  }
  if (input.fromDate && input.toDate && input.fromDate > input.toDate) throw createError(400,'fromDate must not exceed toDate');
  return { where:clauses.length ? ` AND ${clauses.join(' AND ')}`:'', params };
}

class DashboardService {
  constructor(database = db) { this.db = database; }
  async summary(input) {
    const {where,params} = filters(input);
    const conn = await this.db.getConnection();
    try {
      // One consistent snapshot. Aggregations are kept separate to avoid multiplying totals.
      await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await conn.beginTransaction();
      const rows = async sql => (await conn.execute(sql,params))[0];
      const events = await rows(`SELECT fs.*,c.company_name,fl.name location_name FROM flea_market_schedules fs
        JOIN companies c ON c.company_id=fs.company_id JOIN flea_market_locations fl ON fl.location_id=fs.location_id WHERE 1=1 ${where} ORDER BY fs.scheduled_date DESC`);
      if (input.scheduleId && events.length===0) throw createError(404,'Event does not match selected filters');
      const [sales] = await rows(`SELECT COUNT(*) totalInvoices,COUNT(DISTINCT i.vendor_id) sellingVendors,
        COUNT(DISTINCT i.session_id) customerCheckouts,COALESCE(SUM(i.subtotal),0) grossSales,
        COALESCE(SUM(i.reward_discount),0) rewardPointsRedeemed,COALESCE(SUM(i.grand_total),0) netInvoicedAmount
        FROM invoices i JOIN flea_market_schedules fs ON fs.schedule_id=i.schedule_id
        WHERE i.source='flea_market' AND COALESCE(i.invoice_status,'generated')<>'cancelled' ${where}`);
      const [units] = await rows(`SELECT COALESCE(SUM(ii.quantity),0) unitsSold FROM invoice_items ii JOIN invoices i ON i.invoice_id=ii.invoice_id
        JOIN flea_market_schedules fs ON fs.schedule_id=i.schedule_id WHERE i.source='flea_market' AND COALESCE(i.invoice_status,'generated')<>'cancelled' ${where}`);
      const [vendors] = await rows(`SELECT COUNT(DISTINCT ev.vendor_id) participatingVendors FROM flea_market_event_vendors ev
        JOIN flea_market_schedules fs ON fs.schedule_id=ev.schedule_id WHERE ev.status='active' ${where}`);
      const [stock] = await rows(`SELECT COALESCE(SUM(ep.assigned_qty-ep.sold_qty-ep.released_qty),0) stockAvailable
        FROM flea_market_event_products ep JOIN flea_market_schedules fs ON fs.schedule_id=ep.schedule_id WHERE ep.status='active' ${where}`);
      const paymentSummary = await rows(`SELECT pm.method,pm.recipient,pm.status,pm.verification_source,
        SUM(pm.amount) amount,COUNT(*) count FROM flea_market_payments pm JOIN flea_market_schedules fs ON fs.schedule_id=pm.schedule_id
        WHERE 1=1 ${where} GROUP BY pm.method,pm.recipient,pm.status,pm.verification_source`);
      const [payments] = await rows(`SELECT COALESCE(SUM(CASE WHEN pm.status='confirmed' THEN pm.amount ELSE 0 END),0) confirmedPayments
        FROM flea_market_payments pm JOIN flea_market_schedules fs ON fs.schedule_id=pm.schedule_id WHERE 1=1 ${where}`);
      const salesTrend = await rows(`SELECT DATE_FORMAT(i.invoice_date,'%Y-%m-%d') date,SUM(i.subtotal) grossSales,SUM(i.grand_total) netInvoicedAmount
        FROM invoices i JOIN flea_market_schedules fs ON fs.schedule_id=i.schedule_id WHERE i.source='flea_market'
        AND COALESCE(i.invoice_status,'generated')<>'cancelled' ${where} GROUP BY DATE_FORMAT(i.invoice_date,'%Y-%m-%d') ORDER BY date`);
      const topVendors = await rows(`SELECT i.vendor_id vendorId,v.company_name vendorName,SUM(i.subtotal) grossSales,SUM(i.grand_total) netInvoicedAmount
        FROM invoices i JOIN flea_market_schedules fs ON fs.schedule_id=i.schedule_id JOIN vendors v ON v.vendor_id=i.vendor_id
        WHERE i.source='flea_market' AND COALESCE(i.invoice_status,'generated')<>'cancelled' ${where} GROUP BY i.vendor_id,v.company_name ORDER BY grossSales DESC LIMIT 10`);
      const recentInvoices = await rows(`SELECT i.invoice_id invoiceId,i.invoice_number invoiceNumber,i.invoice_date issuedAt,
        i.grand_total netInvoicedAmount,v.company_name vendorName,i.schedule_id scheduleId FROM invoices i
        JOIN flea_market_schedules fs ON fs.schedule_id=i.schedule_id JOIN vendors v ON v.vendor_id=i.vendor_id
        WHERE i.source='flea_market' ${where} ORDER BY i.invoice_date DESC,i.invoice_id DESC LIMIT 10`);
      const threshold = Number(process.env.FLEA_MARKET_LOW_STOCK_THRESHOLD || 5);
      const stockAlerts = (await rows(`SELECT ep.id assignmentId,ep.schedule_id scheduleId,p.product_name productName,
        ep.assigned_qty-ep.sold_qty-ep.released_qty stockAvailable FROM flea_market_event_products ep
        JOIN flea_market_schedules fs ON fs.schedule_id=ep.schedule_id JOIN eproducts p ON p.product_id=ep.product_id
        WHERE ep.status='active' ${where} ORDER BY stockAvailable ASC LIMIT 50`)).filter(x=>Number(x.stockAvailable)<=threshold);
      // Subtraction stays in MySQL DECIMAL, rather than floating-point currency arithmetic.
      const [[outstanding]] = await conn.execute('SELECT GREATEST(CAST(? AS DECIMAL(18,2))-CAST(? AS DECIMAL(18,2)),0) amount',[sales.netInvoicedAmount,payments.confirmedPayments]);
      await conn.commit();
      const e = input.scheduleId ? events[0] : null;
      return {event:e ? {scheduleId:e.schedule_id,companyId:e.company_id,companyName:e.company_name,locationId:e.location_id,locationName:e.location_name,scheduledDate:e.scheduled_date,startTime:e.start_time,endTime:e.end_time,status:e.status}:null,
        events:events.map(e=>({scheduleId:e.schedule_id,companyId:e.company_id,companyName:e.company_name,scheduledDate:e.scheduled_date,status:e.status})),
        metrics:{totalEvents:events.length,...sales,...units,...vendors,...stock,...payments,outstandingPayments:outstanding.amount},
        salesTrend,topVendors,recentInvoices,stockAlerts,paymentSummary};
    } catch(error) { await conn.rollback(); throw error; } finally { conn.release(); }
  }
}
module.exports = new DashboardService();
module.exports.DashboardService = DashboardService;
module.exports.filters = filters;
