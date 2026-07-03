const pool = require("../../config/database");
const { normalizeIndianMobile } = require("./phone");

function safeJsonParse(maybeJson, fallback = null) {
  if (maybeJson == null) return fallback;
  if (typeof maybeJson === "object") return maybeJson;
  if (typeof maybeJson !== "string") return fallback;

  try {
    return JSON.parse(maybeJson);
  } catch (e) {
    return fallback;
  }
}

function matchCondition(condition, ctx) {
  // condition_json like {status:"shipped"} should match ctx.status
  if (!condition) return true;

  for (const k of Object.keys(condition)) {
    if (String(ctx[k] ?? "") !== String(condition[k])) return false;
  }
  return true;
}

function buildButtonValuesFromConfig(buttonConfig, ctx) {
  if (!buttonConfig) return null;

  const cfg = safeJsonParse(buttonConfig, null);
  if (!cfg || typeof cfg !== "object") return null;

  const out = {};
  for (const idx of Object.keys(cfg)) {
    const keys = cfg[idx];
    if (!Array.isArray(keys)) continue;

    out[idx] = keys.map((k) => String(ctx[k] ?? ""));
  }

  // return null if empty
  return Object.keys(out).length ? out : null;
}

async function enqueueWhatsApp({ eventName, ctx }) {
  if (!eventName || !ctx || typeof ctx !== "object") {
    return { ok: false, reason: "INVALID_PAYLOAD" };
  }

  // ctx must include: phone, company_id, etc.
  const phone_full = normalizeIndianMobile(ctx.phone);
  if (!phone_full) return { ok: false, reason: "INVALID_PHONE" };

  try {
    // 1) Find matching Rule (company rules first, then global)
    const [rules] = await pool.query(
      `
      SELECT * FROM wa_rules
      WHERE event_name = ?
        AND is_active = 1
        AND (company_id = ? OR company_id IS NULL)
      ORDER BY (company_id IS NULL) ASC, priority ASC
      `,
      [eventName, ctx.company_id ?? null],
    );

    let picked = null;
    for (const r of rules) {
      const cond = safeJsonParse(r.condition_json, null);
      if (matchCondition(cond, ctx)) {
        picked = r;
        break;
      }
    }

    if (!picked) return { ok: false, reason: "NO_RULE" };

    // 2) Find matching Template (company override first)
    const [tplRows] = await pool.query(
      `
      SELECT * FROM wa_templates
      WHERE template_key = ?
        AND is_active = 1
        AND (company_id = ? OR company_id IS NULL)
      ORDER BY (company_id IS NULL) ASC
      LIMIT 1
      `,
      [picked.template_key, ctx.company_id ?? null],
    );

    if (!tplRows.length) return { ok: false, reason: "TEMPLATE_NOT_FOUND" };

    const tpl = tplRows[0];

    // 3) Build Body Values (exact placeholders {{1}}, {{2}}...)
    const bodyValues = buildBodyValues(picked.template_key, ctx);

    //  Validate body_values_count to avoid Interakt 400
    const expectedCount = Number(tpl.body_values_count ?? 0);
    if (expectedCount && bodyValues.length !== expectedCount) {
      return {
        ok: false,
        reason: "BODY_VALUES_COUNT_MISMATCH",
        template_key: picked.template_key,
        expected: expectedCount,
        got: bodyValues.length,
        bodyValues,
      };
    }

    //  Build Button Values from template button_config (for authentication/button templates)
    const buttonValues = buildButtonValuesFromConfig(tpl.button_config, ctx);

    // 4) Create Unique Key for Idempotency (prevents double send)
    const idem_key = `${ctx.company_id || "GLOBAL"}|${eventName}|${
      picked.template_key
    }|${phone_full}|${ctx.order_id || Date.now()}`;

    //  Store both body_values and button_values in queue
    await pool.query(
      `
      INSERT INTO wa_queue
        (company_id, event_name, template_key, phone_full, body_values, button_values, order_id, idem_key, status)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `,
      [
        ctx.company_id ?? null,
        eventName,
        picked.template_key,
        phone_full,
        JSON.stringify(bodyValues),
        buttonValues ? JSON.stringify(buttonValues) : null,
        ctx.order_id || null,
        idem_key,
      ],
    );

    return {
      ok: true,
      queued: true,
      template_key: picked.template_key,
      has_buttons: !!buttonValues,
    };
  } catch (e) {
    if (
      String(e.message || "").includes("uq_idem") ||
      String(e.code || "") === "ER_DUP_ENTRY"
    ) {
      return { ok: true, queued: false, duplicate: true };
    }

    console.error("[WA_ENQUEUE] Failed to enqueue WhatsApp:", e);
    return { ok: false, reason: "QUEUE_ERROR", error: e.message };
  }
}

function buildBodyValues(templateKey, ctx) {
  // Safe defaults to prevent crashes if data is missing
  const name = ctx.customer_name || "User";
  const coins = ctx.coins || "0";
  const points = ctx.points ?? coins;
  const balance = ctx.balance ?? "0";
  const orderId = String(ctx.order_id || "");
  const otp = String(ctx.otp || "");
  const amount = String(ctx.total_amount || "0");
  const refundAmount = String(ctx.refund_amount || "0");

  // For Login Alert
  const device = ctx.device_name || "Unknown Device";
  const location = ctx.location || "Unknown Location";
  const time = ctx.login_time || new Date().toLocaleString("en-IN");

  switch (templateKey) {
    // --- ONBOARDING ---
    case "onbord_verify":
      // Most OTP templates are 1 param => OTP
      return [otp];

    case "onbord_forgot_pass":
      return [otp];

    case "onbord_login_success":
      return [name];

    case "onbord_login_alert":
      return [name, device, location, time];

    // --- ORDER PLACEMENT ---
    case "order_place_confirm":
      return [name, orderId, amount];

    case "order_place_arriving":
      return [name, orderId];

    case "order_place_delivered":
      return [name, orderId];

    // --- CANCELLATION ---
    case "cancel_order":
      return [name, orderId];

    // --- RETURNS ---
    case "return_order_approved":
      return [name, orderId];

    case "return_order_picked":
      return [name, orderId];

    case "return_order_refund_approved":
      return [name, orderId, refundAmount];

    case "wallet_credit_first_login":
      return [name, coins];

    case "rewardpointsupdate":
      return [name, String(points), String(balance)];

    case "reward_planners_launch_inamdar":
    case "reward_planners_launch_ddm":
    case "reward_planners_launch":
    case "reward_planners_launch_invitation":
      return [name];

    case "reward_planners_ios_launch":
      return [name];

    case "create_account_notification":
      return [name];

    default:
      console.warn(
        `⚠️ Warning: No mapping found for template '${templateKey}'. Using default.`,
      );
      return [name];
  }
}

module.exports = { enqueueWhatsApp };
