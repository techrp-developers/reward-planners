const router = require('express').Router();
const db = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validate, render, recipients } = require('../services/promotions/content');
const { assertMailConfigured } = require('../config/mailTransport');
const { rateLimit } = require('express-rate-limit');
router.use(authenticateToken, authorizeRoles('rm'));
const imageUpload = require('multer')({ storage: require('multer').memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } }).single('image');
const handle = fn => async (req, res) => {
  try { await fn(req, res); } catch (error) {
    console.error('Promotions:', error.code || error.message);
    res.status(error.message === 'MAIL_CONFIG_MISSING' ? 503 : 500).json({ success: false, message: error.message === 'MAIL_CONFIG_MISSING' ? 'Email is not configured. Contact your administrator.' : 'Unable to process promotion. Please try again.' });
  }
};
router.post('/media', rateLimit({ windowMs: 60000, limit: 10 }), (req, res, next) => {
  imageUpload(req, res, error => error ? res.status(400).json({ message: 'Upload one image no larger than 5 MB.' }) : next());
}, handle(async (req, res) => {
  if (!req.file || !['image/jpeg', 'image/png', 'image/webp'].includes(req.file.mimetype)) return res.status(400).json({ message: 'Choose a JPG, PNG or WebP image.' });
  let buffer;
  try { buffer = await require('sharp')(req.file.buffer, { limitInputPixels: 25000000 }).rotate().resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer(); }
  catch { return res.status(400).json({ message: 'This image could not be read. Choose a valid JPG, PNG or WebP.' }); }
  const key = `promotions/${req.user.user_id}/${require('crypto').randomUUID()}.jpg`;
  await require('../utils/r2upload').uploadToR2(buffer, key, 'image/jpeg');
  res.json({ url: require('../utils/publicUrl').getPublicUrl(key) });
}));
router.get('/', handle(async (req, res) => {
  const [rows] = await db.execute(`SELECT p.id, p.name, p.scheduled_at, p.status, p.created_at,
    COUNT(r.id) AS total, SUM(r.status='sent') AS sent, SUM(r.status='failed') AS failed,
    SUM(r.status='unknown') AS uncertain
    FROM rm_promotions p LEFT JOIN rm_promotion_recipients r ON r.promotion_id=p.id
    WHERE p.owner_id=? GROUP BY p.id ORDER BY p.id DESC LIMIT 100`, [req.user.user_id]);
  res.json({ success: true, data: rows });
}));
router.post('/preview', handle(async (req, res) => {
  let content;
  try { content = validate(req.body); } catch (error) { return res.status(400).json({ message: error.message }); }
  res.json({ html: render(content) });
}));
router.post('/', rateLimit({ windowMs: 60000, limit: 10 }), handle(async (req, res) => {
  let content;
  try { content = validate(req.body); } catch (error) { return res.status(400).json({ message: error.message }); }
  assertMailConfigured();
  const [[company]] = await db.execute('SELECT company_email AS email FROM companies WHERE company_id=? AND status=1', [content.companyId]);
  if (!company) return res.status(400).json({ message: 'Select an active company.' });
  let rows = [company];
  if (content.audience !== 'company') {
    [rows] = await db.execute('SELECT id, email FROM company_users WHERE company_id=? AND status=1', [content.companyId]);
    if (content.audience === 'custom') {
      const ids = new Set(content.employeeIds);
      rows = rows.filter(row => ids.has(row.id));
      if (rows.length !== ids.size) return res.status(400).json({ message: 'Selected employees must be active and belong to this company.' });
    }
  }
  const emails = recipients(rows);
  if (!emails.length) return res.status(400).json({ message: 'No valid recipient emails found.' });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute('INSERT INTO rm_promotions (owner_id,name,content,reply_to,scheduled_at) VALUES (?,?,?,?,?)', [req.user.user_id, content.name, JSON.stringify(content), req.user.email, content.scheduledAt ? Date.parse(content.scheduledAt) : Date.now()]);
    for (let start = 0; start < emails.length; start += 500) await connection.query('INSERT INTO rm_promotion_recipients (promotion_id,email) VALUES ?', [emails.slice(start, start + 500).map(email => [result.insertId, email])]);
    await connection.commit();
    res.status(201).json({ success: true, id: result.insertId, recipients: emails.length });
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}));
router.post('/:id/cancel', handle(async (req, res) => {
  const [result] = await db.execute("UPDATE rm_promotions SET status='cancelled' WHERE id=? AND owner_id=? AND status='scheduled'", [req.params.id, req.user.user_id]);
  if (!result.affectedRows) return res.status(409).json({ message: 'This promotion has already started or is unavailable.' });
  res.json({ success: true });
}));
module.exports = router;
