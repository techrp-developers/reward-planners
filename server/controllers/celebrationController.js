const db = require('../config/database');
const { createHash } = require('node:crypto');
const { normalize, invalid, positiveId, text, statuses } = require('../utils/celebrationRequest');

function companyScope(req) {
  if (req.user?.role === 'vendor_manager') return null;
  if (req.user?.role !== 'hr' || !positiveId(req.user.company_id)) throw invalid('An HR account linked to a company is required', 403);
  return Number(req.user.company_id);
}
function fail(error, res) {
  if (!error.status) console.error('Celebration request failed:', error.code || error.message);
  return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Unable to process this celebration request. Please try again.' });
}
exports.create = async (req, res) => {
  try {
    const companyId = companyScope(req);
    if (!companyId) throw invalid('Only HR can submit celebration requests', 403);
    const key = text(req.body?.request_key, 'Request key', 64, true);
    if (!/^[a-zA-Z0-9-]{16,64}$/.test(key)) throw invalid('Invalid request key');
    // Validate the date format before lookup, but allow a successful request to
    // be safely replayed even after its scheduled time has passed.
    const data = normalize(req.body, -Infinity);
    const hash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const findExisting = async () => {
      const [[row]] = await db.query('SELECT id, request_hash FROM celebration_requests WHERE company_id = ? AND request_key = ?', [companyId, key]);
      if (row && row.request_hash !== hash) throw invalid('This request was already submitted with different details. Start a new request.', 409);
      return row;
    };
    const respond = (id, status) => res.status(status).json({ success: true, data: { id, reference: `CEL-${id}` } });
    const existing = await findExisting();
    if (existing) return respond(existing.id, 200);
    normalize(req.body);
    try {
      const [result] = await db.query(`INSERT INTO celebration_requests
        (company_id, created_by, kind, scheduled_at, details, request_key, request_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)`, [companyId, req.user.user_id, data.kind, data.scheduled_at, JSON.stringify(data.details), key, hash]);
      return respond(result.insertId, 201);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') { const existing = await findExisting(); if (existing) return respond(existing.id, 200); }
      throw error;
    }
  } catch (error) { return fail(error, res); }
};
exports.list = async (req, res) => {
  try {
    const companyId = companyScope(req);
    const conditions = [], params = [];
    if (companyId) { conditions.push('r.company_id = ?'); params.push(companyId); }
    if (req.query.kind) {
      if (!['cake', 'event'].includes(req.query.kind)) throw invalid('Invalid celebration type');
      conditions.push('r.kind = ?'); params.push(req.query.kind);
    }
    if (req.query.status) {
      if (!statuses.includes(req.query.status)) throw invalid('Invalid status');
      conditions.push('r.status = ?'); params.push(req.query.status);
    }
    const page = req.query.page == null ? 1 : Number(req.query.page);
    if (!positiveId(page) || page > 100000) throw invalid('Invalid page');
    const [rows] = await db.query(`SELECT r.id, r.company_id, r.kind, r.scheduled_at, r.details, r.status,
      r.manager_reply, r.version, r.created_at, c.company_name
      FROM celebration_requests r LEFT JOIN companies c ON c.company_id = r.company_id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY r.id DESC LIMIT 21 OFFSET ?`, [...params, (page - 1) * 20]);
    return res.json({ success: true, hasMore: rows.length > 20, data: rows.slice(0, 20).map(row => ({ ...row,
      reference: `CEL-${row.id}`, details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
    })) });
  } catch (error) { return fail(error, res); }
};
exports.update = async (req, res) => {
  try {
    if (req.user?.role !== 'vendor_manager') throw invalid('Vendor manager access required', 403);
    if (!positiveId(req.params.id) || !positiveId(req.body?.version) || !statuses.includes(req.body?.status)) throw invalid('Invalid request or status');
    const reply = text(req.body.manager_reply, 'Reply', 4000);
    const [result] = await db.query(`UPDATE celebration_requests SET status = ?, manager_reply = ?,
      updated_by = ?, version = version + 1 WHERE id = ? AND version = ?`,
    [req.body.status, reply, req.user.user_id, Number(req.params.id), Number(req.body.version)]);
    if (!result.affectedRows) throw invalid('This request changed or no longer exists. Refresh and try again.', 409);
    return res.json({ success: true });
  } catch (error) { return fail(error, res); }
};
