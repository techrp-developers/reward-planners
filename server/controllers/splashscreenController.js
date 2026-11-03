const SplashscreenModel = require("../models/splashscreenModel");
const {
  SplashValidationError, artworkUrl, parseInstant, resolveSplash, toIso,
  validateDefault, validatePlacement, validatePlacementPatch,
} = require("../services/splashscreenService");
const { pagesForApi } = require("../utils/splashRegistry");
const { EntryBusyError, withEntryLock } = require("../middleware/splashLinkGuard");

const fail = (res, error, what) => {
  if (error instanceof SplashValidationError || error instanceof EntryBusyError || error.statusCode) {
    return res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({ success: false, message: "This content is already placed on that page and slot for the same platform and audience." });
  }
  if (error.code === "ER_NO_SUCH_TABLE") {
    return res.status(503).json({ success: false, message: "Splash screen tables are not installed. Run migrations/20261103_02_create_cms_splashscreens.sql." });
  }
  console.error(`Splash screens: ${what} failed:`, error);
  return res.status(500).json({ success: false, message: `Could not ${what}` });
};

const placementId = (req) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new SplashValidationError("Invalid placement id");
  return id;
};

const presentPlacement = (row) => row && ({
  id: Number(row.id),
  content_id: Number(row.content_id),
  page_key: row.page_key,
  slot_key: row.slot_key,
  platform: row.platform,
  audience: row.audience,
  frequency_rule: row.frequency_rule,
  display_seconds: row.display_seconds == null ? null : Number(row.display_seconds),
  is_enabled: Boolean(Number(row.is_enabled)),
  created_at: row.created_at,
  // draft | scheduled | live | expired | disabled (a disabled placement wins over the entry's state)
  effective_status: row.effective_status === "active" ? "live" : row.effective_status || null,
  content: {
    image_url: artworkUrl(row),
    title: row.title,
    module: row.module,
    zone: row.zone,
    status: row.content_status,
    priority: Number(row.priority) || 0,
    starts_at: toIso(row.start_utc),
    expires_at: toIso(row.end_utc),
  },
});

/**
 * Which live placements actually win right now, per platform and audience,
 * using the same resolver as the app. Eligible is not the same as shown: a
 * higher-priority campaign may take the slot.
 */
async function showingNow(rows) {
  const winners = new Map();
  const slots = new Map();
  for (const row of rows) {
    if (row.effective_status === "active") slots.set(`${row.page_key}|${row.slot_key}`, [row.page_key, row.slot_key]);
  }
  for (const [pageKey, slotKey] of slots.values()) {
    for (const platform of ["android", "ios"]) {
      for (const audience of ["authenticated", "guest"]) {
        const result = await resolveSplash({ pageKey, slotKey, platform, audience });
        const id = result.campaign?.placement_id;
        if (id) winners.set(id, [...(winners.get(id) || []), { platform, audience }]);
      }
    }
  }
  return winners;
}

class SplashscreenController {
  pages(req, res) {
    return res.json({ success: true, data: pagesForApi() });
  }

  async listPlacements(req, res) {
    try {
      const q = req.query;
      const enabled = q.is_enabled == null || q.is_enabled === "" ? null : ["1", "true"].includes(String(q.is_enabled));
      const result = await SplashscreenModel.listPlacements({
        pageKey: q.page_key || null, slotKey: q.slot_key || null, platform: q.platform || null,
        audience: q.audience || null, enabled, contentId: q.content_id ? Number(q.content_id) || -1 : null,
        status: q.status || null, search: String(q.search || "").trim().slice(0, 100) || null,
        page: q.page, pageSize: q.pageSize,
      });
      const winners = await showingNow(result.placements);
      return res.json({
        success: true,
        data: {
          ...result,
          placements: result.placements.map((row) => ({ ...presentPlacement(row), showing_now: winners.get(Number(row.id)) || [] })),
        },
      });
    } catch (error) {
      return fail(res, error, "list placements");
    }
  }

  async createPlacement(req, res) {
    try {
      const { values, artwork } = await validatePlacement(req.body || {});
      // Linking takes the entry's lock, so it waits for any edit already in progress.
      const id = await withEntryLock(values.content_id, () => SplashscreenModel.createPlacement(values));
      return res.status(201).json({ success: true, data: { placement: presentPlacement(await SplashscreenModel.getPlacement(id)), artwork } });
    } catch (error) {
      return fail(res, error, "create the placement");
    }
  }

  async updatePlacement(req, res) {
    try {
      const id = placementId(req);
      const current = await SplashscreenModel.getPlacement(id);
      if (!current) return res.status(404).json({ success: false, message: "Placement not found" });
      await SplashscreenModel.updatePlacement(id, validatePlacementPatch(req.body || {}, current));
      return res.json({ success: true, data: { placement: presentPlacement(await SplashscreenModel.getPlacement(id)) } });
    } catch (error) {
      return fail(res, error, "update the placement");
    }
  }

  // Removes only the placement; the CMS entry and its artwork are untouched.
  async deletePlacement(req, res) {
    try {
      const removed = await SplashscreenModel.deletePlacement(placementId(req));
      if (!removed) return res.status(404).json({ success: false, message: "Placement not found" });
      return res.json({ success: true, data: { id: Number(req.params.id) } });
    } catch (error) {
      return fail(res, error, "remove the placement");
    }
  }

  async listDefaults(req, res) {
    try {
      const rows = await SplashscreenModel.listDefaults();
      return res.json({
        success: true,
        data: rows.map((row) => ({
          id: Number(row.id), page_key: row.page_key, slot_key: row.slot_key, platform: row.platform,
          fallback_policy: row.fallback_policy,
          default_content_id: row.default_content_id == null ? null : Number(row.default_content_id),
          content: row.default_content_id == null ? null : {
            title: row.content_title, published: Boolean(Number(row.content_published)), expires_at: toIso(row.content_end_utc),
          },
        })),
      });
    } catch (error) {
      return fail(res, error, "list defaults");
    }
  }

  async saveDefault(req, res) {
    try {
      const { values, artwork, publish } = await validateDefault(req.body || {});
      const save = () => (publish ? SplashscreenModel.upsertDefaultAndPublish(values) : SplashscreenModel.upsertDefault(values));
      const saved = values.default_content_id ? await withEntryLock(values.default_content_id, save) : await save();
      return res.json({ success: true, data: { default: saved, artwork } });
    } catch (error) {
      return fail(res, error, "save the default");
    }
  }

  // What the app would get at a chosen moment, for checking a schedule before it goes live.
  async preview(req, res) {
    try {
      const body = req.body || {};
      const data = await resolveSplash({
        pageKey: String(body.page_key || ""), slotKey: String(body.slot_key || ""),
        platform: String(body.platform || ""), audience: String(body.audience || "authenticated"),
        nowUtc: body.at ? parseInstant(body.at) : null,
      });
      return res.json({ success: true, data: { ...data, preview: true } });
    } catch (error) {
      return fail(res, error, "preview");
    }
  }

  // Mobile app. Audience comes from the verified session, never from the request.
  async resolved(req, res) {
    try {
      const data = await resolveSplash({
        pageKey: String(req.query.page_key || ""), slotKey: String(req.query.slot_key || ""),
        platform: String(req.query.platform || ""), audience: req.user ? "authenticated" : "guest",
      });
      return res.json({ success: true, data });
    } catch (error) {
      return fail(res, error, "resolve the splash screen");
    }
  }
}

module.exports = new SplashscreenController();
