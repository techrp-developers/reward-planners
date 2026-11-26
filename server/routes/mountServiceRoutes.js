// The CRM client and its Vite proxy preserve /api/crm. Keep the customer app's
// existing /v1 URLs and expose the same service router through the CRM prefix.
module.exports = function mountServiceRoutes(app, serviceRoutes) {
  app.use('/api/crm/v1', serviceRoutes);
  app.use('/v1', serviceRoutes);
};
