const db = require("../config/database");

const ICON_KEYS = ["default", "diwali", "eid", "christmas", "holi", "independence_day"];
const ANDROID_ICON_KEYS = [...ICON_KEYS, "navratri", "dasera"];
const PLATFORMS = ["ios", "android"];

const fail = (message, statusCode = 400) => {
  throw Object.assign(new Error(message), { statusCode });
};

const validatePlatform = (platform) => {
  if (!PLATFORMS.includes(platform)) fail("platform must be ios or android");
  return platform;
};

const getIconKeys = (platform) => (validatePlatform(platform) === "android" ? ANDROID_ICON_KEYS : ICON_KEYS);

const validateId = (id) => {
  if (!/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id))) {
    fail("Invalid campaign id");
  }
  return Number(id);
};

const toUtcSqlDate = (value) => {
  // Require a timezone so admin schedules resolve consistently across servers.
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    fail("Schedule dates must be ISO 8601 timestamps with a timezone");
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) fail("Invalid schedule date");
  return date.toISOString().slice(0, 23).replace("T", " ");
};

const validateCampaign = (data) => {
  validatePlatform(data.platform);
  if (!getIconKeys(data.platform).includes(data.icon_key)) fail("Unsupported icon_key");

  const startsAt = toUtcSqlDate(data.starts_at);
  const endsAt = toUtcSqlDate(data.ends_at);
  if (endsAt <= startsAt) fail("ends_at must be after starts_at");

  const priority = data.priority === undefined ? 0 : data.priority;
  if (!Number.isInteger(priority) || priority < -2147483648 || priority > 2147483647) {
    fail("priority must be a 32-bit integer");
  }

  const active = data.is_active === undefined ? true : data.is_active;
  if (![true, false, 0, 1].includes(active)) fail("is_active must be a boolean or 0/1");

  return [data.platform, data.icon_key, startsAt, endsAt, priority, Number(active)];
};

const getById = async (id) => {
  const [rows] = await db.execute("SELECT * FROM app_icon_campaigns WHERE id = ?", [validateId(id)]);
  if (!rows[0]) fail("App icon campaign not found", 404);
  return rows[0];
};

module.exports = {
  ICON_KEYS,
  ANDROID_ICON_KEYS,
  getIconKeys,
  validatePlatform,
  validateCampaign,
  getById,

  async resolve(platform) {
    validatePlatform(platform);

    const [rows] = await db.execute(
      `SELECT icon_key
       FROM app_icon_campaigns
       WHERE platform = ? AND is_active = 1
         AND starts_at <= UTC_TIMESTAMP(3) AND ends_at >= UTC_TIMESTAMP(3)
       ORDER BY priority DESC, starts_at DESC, id DESC
       LIMIT 1`,
      [platform],
    );

    return {
      platform,
      icon_key: getIconKeys(platform).includes(rows[0]?.icon_key) ? rows[0].icon_key : "default",
    };
  },

  async list(platform) {
    if (platform !== undefined) validatePlatform(platform);

    const [rows] = await db.execute(
      `SELECT *
       FROM app_icon_campaigns${platform === undefined ? "" : " WHERE platform = ?"}
       ORDER BY priority DESC, id DESC`,
      platform === undefined ? [] : [platform],
    );

    return rows;
  },

  async create(data) {
    const values = validateCampaign(data);
    const [result] = await db.execute(
      "INSERT INTO app_icon_campaigns (platform, icon_key, starts_at, ends_at, priority, is_active) VALUES (?, ?, ?, ?, ?, ?)",
      values,
    );

    return getById(result.insertId);
  },

  async update(id, data) {
    const existing = await getById(id);
    const merged = {
      ...existing,
      starts_at: String(existing.starts_at).replace(" ", "T") + "Z",
      ends_at: String(existing.ends_at).replace(" ", "T") + "Z",
      ...data,
    };
    const values = validateCampaign(merged);

    await db.execute(
      "UPDATE app_icon_campaigns SET platform = ?, icon_key = ?, starts_at = ?, ends_at = ?, priority = ?, is_active = ? WHERE id = ?",
      [...values, validateId(id)],
    );

    return getById(id);
  },

  async deactivate(id) {
    await getById(id);
    await db.execute("UPDATE app_icon_campaigns SET is_active = 0 WHERE id = ?", [validateId(id)]);
    return getById(id);
  },

  async delete(id) {
    await getById(id);
    await db.execute("DELETE FROM app_icon_campaigns WHERE id = ?", [validateId(id)]);
    return { id: Number(id) };
  },
};
