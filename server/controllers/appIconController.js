const model = require("../models/appIconModel");

const handler = (action, status = 200) => async (req, res) => {
  try {
    const data = await action(req);
    res.set("Cache-Control", "no-store");
    return res.status(status).json({ success: true, data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  resolve: handler((req) => model.resolve(req.query.platform)),
  keys: handler((req) => ({
    platform: model.validatePlatform(req.query.platform),
    icon_keys: model.getIconKeys(req.query.platform),
  })),
  list: handler((req) => model.list(req.query.platform)),
  get: handler((req) => model.getById(req.params.id)),
  create: handler((req) => model.create(req.body), 201),
  update: handler((req) => model.update(req.params.id, req.body)),
  deactivate: handler((req) => model.deactivate(req.params.id)),
  delete: handler((req) => model.delete(req.params.id)),
};
