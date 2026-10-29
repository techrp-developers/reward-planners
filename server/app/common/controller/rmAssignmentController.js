const RmAssignmentModel = require("../models/rmAssignmentModel");

// Admin-only management of RM -> company assignments. RMs can only send push
// campaigns to employees of companies assigned here.

const MAX_COMPANIES_PER_REQUEST = 100;

const positiveInt = (value) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && String(value).trim() === String(number) ? number : null;
};

function handleError(res, error, context) {
  console.error(`[RM Assignments] ${context} failed:`, error.message);
  return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
}

function createRmAssignmentController(model = RmAssignmentModel) {
  return {
    /** Route guard: only admins; denied attempts are audited. */
    async requireAdmin(req, res, next) {
      if (req.user?.role === "admin") return next();
      await model.auditDenied({
        actor: req.user,
        ip: req.ip,
        details: { reason: "not_admin", method: req.method, path: req.originalUrl.split("?")[0].slice(0, 200) },
      });
      return res.status(403).json({ success: false, message: "Only an admin can manage RM company assignments." });
    },

    async list(req, res) {
      try {
        return res.json({ success: true, data: await model.listRms() });
      } catch (error) {
        return handleError(res, error, "list");
      }
    },

    async companies(req, res) {
      try {
        return res.json({ success: true, data: await model.listCompanies() });
      } catch (error) {
        return handleError(res, error, "companies");
      }
    },

    async assign(req, res) {
      try {
        const rmUserId = positiveInt(req.params.rmUserId);
        const raw = req.body?.company_ids;
        const companyIds = Array.isArray(raw) ? raw.map(positiveInt) : [];
        if (!rmUserId) return res.status(400).json({ success: false, message: "Invalid RM id." });
        if (!companyIds.length || companyIds.includes(null)) {
          return res.status(400).json({ success: false, message: "company_ids must be a non-empty list of company ids." });
        }
        if (companyIds.length > MAX_COMPANIES_PER_REQUEST) {
          return res.status(400).json({ success: false, message: `Assign at most ${MAX_COMPANIES_PER_REQUEST} companies per request.` });
        }

        const result = await model.assign({ rmUserId, companyIds: [...new Set(companyIds)], actor: req.user, ip: req.ip });
        if (result.error) {
          await model.auditDenied({ actor: req.user, ip: req.ip, details: { reason: result.error.message, rm_user_id: rmUserId, company_ids: companyIds } });
          const { status, ...body } = result.error;
          return res.status(status).json({ success: false, ...body });
        }
        return res.status(result.assigned.length ? 201 : 200).json({
          success: true,
          data: { rm_user_id: rmUserId, assigned: result.assigned, already_assigned: result.alreadyAssigned },
        });
      } catch (error) {
        return handleError(res, error, "assign");
      }
    },

    async revoke(req, res) {
      try {
        const rmUserId = positiveInt(req.params.rmUserId);
        const companyId = positiveInt(req.params.companyId);
        if (!rmUserId || !companyId) return res.status(400).json({ success: false, message: "Invalid RM or company id." });
        const { removed } = await model.revoke({ rmUserId, companyId, actor: req.user, ip: req.ip });
        return res.json({ success: true, data: { rm_user_id: rmUserId, company_id: companyId, removed } });
      } catch (error) {
        return handleError(res, error, "revoke");
      }
    },

    async audit(req, res) {
      try {
        const rmUserId = req.query.rm_user_id ? positiveInt(req.query.rm_user_id) : null;
        if (req.query.rm_user_id && !rmUserId) return res.status(400).json({ success: false, message: "Invalid RM id." });
        return res.json({ success: true, data: await model.auditTrail({ rmUserId, page: req.query.page, limit: req.query.limit }) });
      } catch (error) {
        return handleError(res, error, "audit");
      }
    },
  };
}

module.exports = createRmAssignmentController();
module.exports.createRmAssignmentController = createRmAssignmentController;
