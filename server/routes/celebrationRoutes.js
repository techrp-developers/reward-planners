const router = require('express').Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const controller = require('../controllers/celebrationController');
router.use(authenticateToken, authorizeRoles('hr', 'vendor_manager'));
router.get('/', controller.list);
router.post('/', authorizeRoles('hr'), controller.create);
router.patch('/:id', authorizeRoles('vendor_manager'), controller.update);
module.exports = router;
