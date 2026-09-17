const express = require('express');
const router = express.Router();
const CmsController = require('../controller/cmsController');
const { authenticateToken, authorizeRoles } = require('../../../middleware/auth');

router.get('/dashboard-layouts/:id', CmsController.getDashboardLayout.bind(CmsController));

router.put(
  '/dashboard-layouts/:id',
  authenticateToken,
  authorizeRoles('admin'),
  CmsController.publishDashboardLayout.bind(CmsController),
);

module.exports = router;
