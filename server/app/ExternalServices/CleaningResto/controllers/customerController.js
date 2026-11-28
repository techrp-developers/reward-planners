const cat = require("../models/catalogueModel");
const svc = require("../services/enquiryService");
const v = require("../validators/enquiryValidator");
const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e.status)
      return res
        .status(e.status)
        .json({
          success: false,
          ...(e.code ? { code: e.code } : {}),
          message: e.message,
          ...(e.fields ? { errors: e.fields } : {}),
        });
    if (e.code && e.code.startsWith("ER_")) {
      console.error("External services database error:", e.code);
      return next(new Error("External services request failed"));
    }
    next(e);
  }
};
exports.types = wrap(async (req, res) =>
  res.json({ success: true, data: await cat.types() }),
);
exports.categories = wrap(async (req, res) =>
  res.json({
    success: true,
    data: await cat.categories(v.id(req.params.typeId, "typeId")),
  }),
);
exports.form = wrap(async (req, res) =>
  res.json({ success: true, data: await svc.form(req.params.categoryId) }),
);
exports.create = wrap(async (req, res) =>
  res
    .status(201)
    .json({
      success: true,
      data: await svc.create(req.body, req.user.user_id),
    }),
);
exports.uploadPhoto = wrap(async (req, res) =>
  res
    .status(201)
    .json({
      success: true,
      data: await svc.uploadPhoto(req.file, req.user.user_id),
    }),
);
exports.list = wrap(async (req, res) =>
  res.json({
    success: true,
    data: await svc.listCustomer(req.user.user_id, req.query),
  }),
);
exports.detail = wrap(async (req, res) =>
  res.json({
    success: true,
    data: await svc.detail(req.params.enquiryId, req.user.user_id),
  }),
);
exports.wrap = wrap;

exports.providers = wrap(async (req, res) => {
  const data = await cat.providers();
  if (!data.some((provider) => provider.isAcceptingEnquiries)) {
    const error = new Error(
      "External services are not configured for enquiries",
    );
    error.status = 503;
    error.code = "EXTERNAL_SERVICES_NOT_CONFIGURED";
    throw error;
  }
  res.json({ success: true, data });
});
exports.providerTypes = wrap(async (req, res) =>
  res.json({
    success: true,
    data: await cat.providerTypes(v.id(req.params.providerId, "providerId")),
  }),
);
exports.providerCategories = wrap(async (req, res) =>
  res.json({
    success: true,
    data: await cat.providerCategories(
      v.id(req.params.providerId, "providerId"),
      v.id(req.params.typeId, "typeId"),
    ),
  }),
);
