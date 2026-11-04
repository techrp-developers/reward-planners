const ModuleIconModel = require('../models/moduleIconModel');
const { CMS_MODULE_HEADER, createModuleCompatibility } = require('../utils/cmsModuleCompatibility');

// Public app endpoints only. Admin reads/writes always use canonical DB keys.
module.exports = async function cmsModuleCompatibility(req, res, next) {
  res.vary(CMS_MODULE_HEADER);
  try {
    const rows = await ModuleIconModel.getAllModules();
    const compatibility = createModuleCompatibility(rows, req.get(CMS_MODULE_HEADER));
    req.cmsModuleCompatibility = compatibility;
    const json = res.json.bind(res);
    res.json = payload => json(compatibility.project(payload));
    if (req.params.module) {
      if (compatibility.unavailable(req.params.module)) {
        return res.json({ success: true, data: {} });
      }
      req.params.module = compatibility.resolveKey(req.params.module);
    }
    return next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Unable to resolve CMS modules' });
  }
};
