const db = require('../config/database');
const { createHash } = require('node:crypto');
const { getPublicUrl } = require('../utils/publicUrl');
const statuses = ['new', 'contacted', 'quoted', 'confirmed', 'closed'];
const eligible = "p.status = 'approved' AND v.status = 'approved' AND pv.is_visible = 1";
const catalogueSelect = `SELECT p.product_id, p.product_name, p.short_description,
  pv.variant_id, pv.sku, pv.variant_attributes, pv.sale_price,
  v.vendor_id, v.company_name AS vendor_name,
  (SELECT image_url FROM product_images pi WHERE pi.product_id = p.product_id ORDER BY pi.image_id LIMIT 1) AS image_url
  FROM product_variants pv JOIN eproducts p ON p.product_id = pv.product_id
  JOIN vendors v ON v.vendor_id = p.vendor_id`;

function bad(message, status = 400) { return Object.assign(new Error(message), { status }); }
function integer(value) {
  return (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)))
    && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}
function text(value, max, name, required = false) {
  if (value != null && typeof value !== 'string') throw bad(`${name} must be text`);
  const result = (value || '').trim();
  if ((required && !result) || result.length > max) throw bad(`${name} is required and must be at most ${max} characters`);
  return result;
}
function normalize(body) {
  if (!['team', 'individual'].includes(body.recipient_type)) throw bad('Choose team or individual gifting');
  const data = {
    recipient_type: body.recipient_type,
    recipient_details: text(body.recipient_details, 250, 'Recipient or team', true),
    occasion: text(body.occasion, 150, 'Occasion'),
    contact_name: text(body.contact_name, 150, 'Contact name', true),
    contact_email: text(body.contact_email, 254, 'Contact email', true).toLowerCase(),
    contact_phone: text(body.contact_phone, 30, 'Contact phone', true),
    delivery_date: body.delivery_date || null,
    delivery_address: text(body.delivery_address, 1000, 'Delivery address', true),
    budget: body.budget === '' || body.budget == null ? null : Number(body.budget),
    requirements: text(body.requirements, 4000, 'Requirements'),
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contact_email)) throw bad('Enter a valid email');
  if (!/^[+\d()\s-]{7,30}$/.test(data.contact_phone) || data.contact_phone.replace(/\D/g, '').length < 7) throw bad('Enter a valid phone number');
  if (body.budget != null && !['string', 'number'].includes(typeof body.budget)) throw bad('Enter a valid total budget');
  if (data.budget !== null && (!Number.isFinite(data.budget) || data.budget < 0 || data.budget > 9999999999.99)) throw bad('Enter a valid total budget');
  if (data.delivery_date) {
    const date = new Date(`${data.delivery_date}T00:00:00Z`);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.delivery_date) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== data.delivery_date || data.delivery_date < today) throw bad('Choose today or a future delivery date');
  }
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 50) throw bad('Select 1 to 50 catalogue items');
  const ids = new Set();
  data.items = body.items.map(item => {
    if (!item || !integer(item.variant_id) || !integer(item.quantity) || Number(item.quantity) > 100000 || ids.has(Number(item.variant_id))) throw bad('Each product variant must have a unique selection and quantity between 1 and 100000');
    ids.add(Number(item.variant_id));
    return { variant_id: Number(item.variant_id), quantity: Number(item.quantity) };
  }).sort((a, b) => a.variant_id - b.variant_id);
  return data;
}
function handle(error, res) {
  if (!error.status) console.error('Corporate gifting:', error.code || error.message);
  return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Unable to process corporate gifting. Please try again.' });
}
function scope(req) {
  if (req.user.role === 'vendor_manager') return null;
  if (req.user.role !== 'hr' || !integer(req.user.company_id)) throw bad('A company HR account is required', 403);
  return Number(req.user.company_id);
}
function rowData(row) {
  return { ...row, reference: `CG-${row.id}`, items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items };
}

exports.catalogue = async (req, res) => {
  try {
    scope(req);
    const search = text(req.query.search, 100, 'Search');
    const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
    if (!Number.isInteger(page)) throw bad('Invalid page');
    const [rows] = await db.query(`${catalogueSelect} WHERE ${eligible}
      AND (p.product_name LIKE ? OR pv.sku LIKE ?) ORDER BY p.product_name, pv.variant_id LIMIT 25 OFFSET ?`,
    [`%${search}%`, `%${search}%`, (page - 1) * 24]);
    return res.json({ success: true, hasMore: rows.length > 24, data: rows.slice(0, 24).map(row => ({ ...row, image_url: getPublicUrl(row.image_url) })) });
  } catch (error) { return handle(error, res); }
};

exports.create = async (req, res) => {
  try {
    const companyId = scope(req);
    if (!companyId) throw bad('Only HR can submit gifting enquiries', 403);
    const data = normalize(req.body || {});
    const key = text(req.body.request_key, 64, 'Request key', true);
    if (!/^[a-zA-Z0-9-]{16,64}$/.test(key)) throw bad('Invalid request key');
    const hash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const existing = async () => {
      const [[row]] = await db.query('SELECT id, request_hash FROM corporate_gifting_enquiries WHERE company_id = ? AND request_key = ?', [companyId, key]);
      if (row && row.request_hash !== hash) throw bad('This request was already submitted with different details. Refresh before sending a new enquiry.', 409);
      return row;
    };
    const respond = (id, code) => res.status(code).json({ success: true, data: { id, reference: `CG-${id}` } });
    const prior = await existing();
    if (prior) return respond(prior.id, 200);
    const [products] = await db.query(`${catalogueSelect} WHERE ${eligible} AND pv.variant_id IN (${data.items.map(() => '?').join(',')})`, data.items.map(item => item.variant_id));
    if (products.length !== data.items.length) throw bad('A selected product is no longer available. Refresh the catalogue and update your selection.');
    const items = data.items.map(item => ({ ...products.find(product => Number(product.variant_id) === item.variant_id), quantity: item.quantity }));
    const fields = ['recipient_type', 'recipient_details', 'occasion', 'contact_name', 'contact_email', 'contact_phone', 'delivery_date', 'delivery_address', 'budget', 'requirements'];
    try {
      const [result] = await db.query(`INSERT INTO corporate_gifting_enquiries
        (company_id, created_by, request_key, request_hash, ${fields.join(',')}, items)
        VALUES (${Array(15).fill('?').join(',')})`,
      [companyId, req.user.user_id, key, hash, ...fields.map(field => data[field]), JSON.stringify(items)]);
      return respond(result.insertId, 201);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') { const prior = await existing(); if (prior) return respond(prior.id, 200); }
      throw error;
    }
  } catch (error) { return handle(error, res); }
};

exports.list = async (req, res) => {
  try {
    const companyId = scope(req);
    const conditions = [], params = [];
    if (companyId) { conditions.push('g.company_id = ?'); params.push(companyId); }
    if (req.query.status) {
      if (!statuses.includes(req.query.status)) throw bad('Invalid enquiry status');
      conditions.push('g.status = ?'); params.push(req.query.status);
    }
    const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
    if (!Number.isInteger(page)) throw bad('Invalid page');
    const [rows] = await db.query(`SELECT g.*, co.company_name FROM corporate_gifting_enquiries g
      LEFT JOIN companies co ON co.company_id = g.company_id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY g.id DESC LIMIT 21 OFFSET ?`, [...params, (page - 1) * 20]);
    return res.json({ success: true, hasMore: rows.length > 20, data: rows.slice(0, 20).map(row => {
      const { request_key, request_hash, ...data } = rowData(row);
      return data;
    }) });
  } catch (error) { return handle(error, res); }
};

exports.update = async (req, res) => {
  try {
    if (req.user.role !== 'vendor_manager') throw bad('Vendor manager access required', 403);
    if (!integer(req.params.id) || !integer(req.body.version) || !statuses.includes(req.body.status)) throw bad('Invalid enquiry or status');
    const reply = text(req.body.manager_reply, 4000, 'Reply');
    const [result] = await db.query(`UPDATE corporate_gifting_enquiries
      SET status = ?, manager_reply = ?, updated_by = ?, version = version + 1
      WHERE id = ? AND version = ?`, [req.body.status, reply, req.user.user_id, Number(req.params.id), Number(req.body.version)]);
    if (!result.affectedRows) throw bad('This enquiry changed or no longer exists. Refresh and try again.', 409);
    return res.json({ success: true });
  } catch (error) { return handle(error, res); }
};

exports.normalize = normalize;
