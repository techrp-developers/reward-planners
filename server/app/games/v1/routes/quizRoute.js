const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { rateLimit } = require('express-rate-limit');
const auth = require('../../../common/middlewares/auth');
const controller = require('../controller/quizController');

// Quiz scores require verified identity even when the shared local auth fallback is enabled.
router.use((req, res, next) => {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Please sign in again to play.' });
  }
}, auth);
router.use(rateLimit({ windowMs: 60000, limit: 120, keyGenerator: req => String(req.user.user_id), standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many quiz requests. Please wait a moment.' } }));
router.get('/leaderboard', controller.leaderboard);
router.post('/sessions', controller.start);
router.get('/sessions/:id', controller.get);
router.use('/sessions/:id', (req, res, next) => {
  const { index, option } = req.body || {};
  if (!Number.isInteger(index) || index < 0 || index >= 5 ||
      (req.path.endsWith('/answer') && (!Number.isInteger(option) || option < 0 || option > 3))) {
    return res.status(422).json({ success: false, message: 'Invalid question or answer.' });
  }
  next();
});
router.post('/sessions/:id/answer', controller.answer);
router.post('/sessions/:id/next', controller.next);
module.exports = router;
