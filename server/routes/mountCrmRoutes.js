const express = require('express');

// Vite and the deployed CRM proxy preserve /api/crm. Both modules share that
// prefix; the legacy root paths remain available for existing integrations.
module.exports = function mountCrmRoutes(app, crmRoutes, fleaMarketRoutes) {
  const crm = express.Router();
  crm.use(crmRoutes);
  crm.use(fleaMarketRoutes);
  app.use('/api/crm', crm);
  app.use('/', crm);
};
