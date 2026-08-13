const axios = require("axios");
const { createHash } = require("crypto");
const headerUtil = require("../utils/header");
const retry = require("../utils/retry");
const {
  getBbpsSourceIP,
  getBbpsSourceIPDetails,
  getClientIP,
} = require("../utils/network");

const resolveBaseUrl = () => {
  if (process.env.EKO_BASE_URL) {
    return process.env.EKO_BASE_URL.trim();
  }

  const providerEnvironment = (process.env.EKO_ENV || "production")
    .trim()
    .toLowerCase();

  return ["uat", "staging", "test"].includes(providerEnvironment)
    ? process.env.EKO_BASE_URL_UAT
    : process.env.EKO_BASE_URL_PROD;
};

const ensureTrailingSlash = (url = "") => {
  return url.endsWith("/") ? url : `${url}/`;
};

const BASE = ensureTrailingSlash(resolveBaseUrl() || "");
const ekoUrl = (path) => `${BASE}${path}`;
const resolveRechargeBaseUrl = () => {
  if (process.env.EKO_RECHARGE_BASE_URL) {
    return process.env.EKO_RECHARGE_BASE_URL.trim();
  }

  const providerEnvironment = (process.env.EKO_ENV || "production")
    .trim()
    .toLowerCase();

  if (["uat", "staging", "test"].includes(providerEnvironment)) {
    return (
      process.env.EKO_RECHARGE_BASE_URL_UAT ||
      "https://staging.eko.in:25004/ekoapi/v3/"
    );
  }

  return (
    process.env.EKO_RECHARGE_BASE_URL_PROD ||
    "https://api.eko.in:25002/ekoicici/v3/"
  );
};
const RECHARGE_BASE = ensureTrailingSlash(resolveRechargeBaseUrl());
const ekoRechargeUrl = (path) => `${RECHARGE_BASE}${path}`;
const configuredFetchBillTimeout = Number(
  process.env.EKO_FETCH_BILL_TIMEOUT_MS || 30000,
);
const FETCH_BILL_TIMEOUT_MS =
  Number.isFinite(configuredFetchBillTimeout) && configuredFetchBillTimeout > 0
    ? configuredFetchBillTimeout
    : 30000;
const configuredCatalogCacheTtl = Number(
  process.env.EKO_CATALOG_CACHE_TTL_MS || 5 * 60 * 1000,
);
const CATALOG_CACHE_TTL_MS =
  Number.isFinite(configuredCatalogCacheTtl) && configuredCatalogCacheTtl > 0
    ? configuredCatalogCacheTtl
    : 5 * 60 * 1000;
const catalogCache = new Map();

// BBPS services currently enabled in the app. Keep the remaining provider
// categories disabled until their payment journeys are supported end to end.
const ENABLED_CATEGORY_NAMES = new Set([
  "mobile prepaid",
  "mobile postpaid",
  "credit card",
  "electricity",
  "fastag",
]);

const normalizeCategoryName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");

const getCategoryName = (category) =>
  category?.category_name ??
  category?.categoryName ??
  category?.name ??
  category?.operator_category_name;

const getCategoryId = (category) =>
  category?.category_id ?? category?.categoryId ?? category?.operator_category;

const isEnabledCategory = (category) =>
  ENABLED_CATEGORY_NAMES.has(normalizeCategoryName(getCategoryName(category)));

const getEnabledCategoryIds = async () => {
  const categoryResponse = await exports.getCategories();
  return new Set(
    (Array.isArray(categoryResponse?.data) ? categoryResponse.data : [])
      .map(getCategoryId)
      .filter((id) => id !== undefined && id !== null)
      .map(String),
  );
};

const normalizeProviderError = (error, fallbackMessage) => {
  const isTimeout =
    error.code === "ECONNABORTED" ||
    /timeout/i.test(String(error.message || ""));
  const statusCode = isTimeout ? 504 : error.response?.status || error.statusCode || 500;
  const providerData = error.response?.data;
  const hasHtmlBody =
    typeof providerData === "string" && /<\s*html/i.test(providerData);
  const providerMessage =
    (typeof providerData === "object" &&
      (providerData?.message || providerData?.error)) ||
    (typeof providerData === "string" && !hasHtmlBody ? providerData : null) ||
    error.providerMessage ||
    error.message;

  const normalizedError = new Error(
    isTimeout
      ? `BBPS provider timed out after ${FETCH_BILL_TIMEOUT_MS}ms`
      : statusCode === 401
      ? "Provider authorization failed"
      : statusCode === 403
        ? "Provider access forbidden"
        : providerMessage || fallbackMessage || "Provider request failed",
  );

  normalizedError.statusCode = statusCode;
  normalizedError.details =
    providerData && typeof providerData === "object" ? providerData : undefined;
  normalizedError.providerMessage = providerMessage;
  normalizedError.providerResponse = {
    statusCode,
    message: normalizedError.message,
    providerMessage,
    providerBodyType: hasHtmlBody ? "html" : typeof providerData,
  };

  return normalizedError;
};

const withCatalogCache = async (key, loader) => {
  const cached = catalogCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const pending = Promise.resolve().then(loader);
  catalogCache.set(key, {
    value: pending,
    expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
  });

  try {
    return await pending;
  } catch (error) {
    catalogCache.delete(key);
    throw error;
  }
};

// 0. Get Locations
exports.getLocations = async () => {
  return withCatalogCache("locations", async () => {
    const headers = await headerUtil.fetchHeaders();
    const res = await axios.get(ekoUrl("billpayments/operators_location"), {
      headers,
    });
    return res.data;
  });
};

// 1. Categories
exports.getCategories = async () => {
  const data = await withCatalogCache("categories", async () => {
    const headers = await headerUtil.fetchHeaders();
    const res = await axios.get(ekoUrl("billpayments/operators_category"), {
      headers,
    });
    return res.data;
  });

  return {
    ...data,
    data: (Array.isArray(data?.data) ? data.data : []).filter(isEnabledCategory),
  };
};

// 2. Operators
exports.getOperators = async (category_id) => {
  const [data, enabledCategoryIds] = await Promise.all([
    withCatalogCache("operators", async () => {
      const headers = await headerUtil.fetchHeaders();
      const res = await axios.get(ekoUrl("billpayments/operators"), { headers });
      return res.data;
    }),
    getEnabledCategoryIds(),
  ]);

  let operators = (Array.isArray(data?.data) ? data.data : []).filter((op) =>
    enabledCategoryIds.has(String(op.operator_category)),
  );

  if (category_id) {
    operators = operators.filter((op) => op.operator_category == category_id);
  }

  return {
    ...data,
    data: operators,
  };
};

// 2.5 Grouped operators
exports.getOperatorsGrouped = async (category_id, search = "") => {
  const [operatorsResponse, locationResponse] = await Promise.all([
    exports.getOperators(),
    exports.getLocations(),
  ]);

  let operators = operatorsResponse?.data || [];
  const locations = locationResponse?.data || [];

  //  STEP 1: FILTER BY CATEGORY_ID (optional - omit to search across all operators)
  if (category_id) {
    operators = operators.filter((op) => op.operator_category == category_id);
  }

  //  STEP 2: SEARCH (optional)
  if (search) {
    const keyword = search.toLowerCase();
    operators = operators.filter((op) =>
      op.name?.toLowerCase().includes(keyword),
    );
  }

  //  STEP 3: MAP LOCATIONS
  const locationMap = {};
  locations.forEach((loc) => {
    locationMap[loc.operator_location_id.padStart(2, "0")] =
      loc.operator_location_name;
  });

  //  STEP 4: GROUP
  const grouped = {};

  operators.forEach((op) => {
    const locId = op.location_id.toString().padStart(2, "0");
    const locName = locationMap[locId] || "Others";

    if (!grouped[locName]) grouped[locName] = [];

    grouped[locName].push({
      operator_id: op.operator_id,
      name: op.name,
    });
  });

  return grouped;
};

// 2.6 Search operators across ALL categories (no category_id scoping)
exports.searchOperators = async (keyword = "") => {
  const term = String(keyword || "").trim().toLowerCase();

  if (!term) {
    return [];
  }

  const data = await exports.getOperators();
  const operators = data?.data || [];

  return operators
    .filter((op) => op.name?.toLowerCase().includes(term))
    .map((op) => ({
      operator_id: op.operator_id,
      name: op.name,
      operator_category: op.operator_category,
      location_id: op.location_id,
    }));
};

// 3. Operator details
exports.getOperatorDetails = async (id) => {
  return withCatalogCache(`operator:${id}`, async () => {
    const headers = await headerUtil.fetchHeaders();
    const res = await axios.get(ekoUrl(`billpayments/operators/${id}`), {
      headers,
    });
    return res.data;
  });
};

exports.getRechargePlans = async ({ mobile, operatorCode, circleId }) => {
  const headers = await headerUtil.fetchHeaders();
  const path = `customer/payment/bbps/recharge/${encodeURIComponent(
    mobile,
  )}/operator/plans`;

  const params = {
    initiator_id: process.env.EKO_INITIATOR_ID,
    user_code: process.env.EKO_USER_CODE,
  };

  if (operatorCode) {
    params.phone_operator_code = operatorCode;
  }

  if (circleId) {
    params.circleid = circleId;
  }

  const response = await axios.get(ekoRechargeUrl(path), {
    headers,
    params,
    timeout: FETCH_BILL_TIMEOUT_MS,
  });

  const providerResponse = response.data || {};

  if (Number(providerResponse.status) !== 0) {
    const error = new Error(
      providerResponse.message || "EKO failed to return recharge plans",
    );
    error.statusCode = 502;
    error.details = providerResponse;
    throw error;
  }

  const planGroups = Array.isArray(providerResponse.dependent_params)
    ? providerResponse.dependent_params
    : [];

  const buildPlan = (plan) => {
    const amount = String(plan?.amount || "").trim();
    const validity = String(plan?.validity || "").trim();
    const description = String(plan?.plan_description || "").trim();

    if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
      return null;
    }

    const fingerprint = `${operatorCode}|${circleId}|${amount}|${validity}|${description}`;
    return {
      planId: createHash("sha256")
        .update(fingerprint)
        .digest("hex")
        .slice(0, 20),
      amount,
      validity: validity || null,
      description: description || null,
      _fp: fingerprint,
    };
  };

  // Keyword-based fallback used when EKO doesn't supply category labels
  const AUTO_CATEGORIES = [
    {
      label: "OTT & Premium",
      test: (d) =>
        /netflix|amazon prime|jiohotstar|sonyliv|zee5|fancode|vi movies & tv/i.test(d),
    },
    {
      label: "Unlimited",
      test: (d) => /full day unlimited data|\d+(\.\d+)?\s*gb\/day/i.test(d),
    },
    {
      label: "Combo",
      test: (d) => /pack combo/i.test(d),
    },
    {
      label: "Data Pack",
      test: (d) => /\d+\s*gb\b/i.test(d),
    },
  ];

  const autoCategory = (description) => {
    for (const rule of AUTO_CATEGORIES) {
      if (rule.test(description)) return rule.label;
    }
    return "Other";
  };

  // Build grouped structure, deduplicating within each group
  let groups = planGroups
    .map((group) => {
      const label = String(group?.key || "").trim();
      const seen = new Set();
      const plans = (Array.isArray(group?.value) ? group.value : [])
        .map(buildPlan)
        .filter((p) => p !== null && !seen.has(p._fp) && seen.add(p._fp))
        .map(({ _fp, ...rest }) => rest)
        .sort((a, b) => Number(a.amount) - Number(b.amount));
      return { label, plans };
    })
    .filter((g) => g.plans.length > 0);

  // If EKO didn't provide category labels, auto-categorize by description keywords
  const hasRealLabels = groups.some((g) => g.label !== "");
  if (!hasRealLabels) {
    const allPlans = groups.flatMap((g) => g.plans);
    const buckets = {};
    for (const plan of allPlans) {
      const cat = autoCategory(plan.description || "");
      if (!buckets[cat]) buckets[cat] = [];
      buckets[cat].push(plan);
    }
    const ORDER = ["Unlimited", "Combo", "Data Pack", "OTT & Premium", "Other"];
    groups = ORDER.filter((cat) => buckets[cat]?.length)
      .map((cat) => ({ label: cat, plans: buckets[cat] }));
  } else {
    groups = groups.map((g) => ({ ...g, label: g.label || "Other" }));
  }

  // Flat deduplicated list for internal plan-id lookups (e.g. payment validation)
  const allSeen = new Set();
  const plans = groups
    .flatMap((g) => g.plans.map((p) => ({ ...p, _fp: `${p.planId}` })))
    .filter((p) => !allSeen.has(p._fp) && allSeen.add(p._fp))
    .map(({ _fp, ...rest }) => rest)
    .sort((a, b) => Number(a.amount) - Number(b.amount));

  return {
    status: providerResponse.status,
    responseTypeId: providerResponse.response_type_id,
    message: providerResponse.message,
    operatorId: operatorCode ? String(operatorCode) : null,
    circleId: circleId ? String(circleId) : null,
    mobile,
    count: plans.length,
    groups,
    plans,
  };
};

exports.getFetchBillReadiness = async (req, operatorId) => {
  const sourceIpDetails = await getBbpsSourceIPDetails(req);
  const coreConfig = {
    baseUrlConfigured: Boolean(BASE),
    providerEnvironment: (process.env.EKO_ENV || "production").toLowerCase(),
    providerBaseUrl: BASE || null,
    developerKeyConfigured: Boolean(process.env.EKO_DEVELOPER_KEY),
    accessKeyConfigured: Boolean(process.env.EKO_ACCESS_KEY),
    userCodeConfigured: Boolean(process.env.EKO_USER_CODE),
    initiatorIdConfigured: Boolean(process.env.EKO_INITIATOR_ID),
  };

  const config = {
    ...coreConfig,
    sourceIpConfigured: Boolean(sourceIpDetails.configuredIp),
    sourceIpResolved: Boolean(sourceIpDetails.finalIp),
    sourceIpMatchesServer:
      !sourceIpDetails.configuredIp || sourceIpDetails.configuredMatchesServer,
  };

  const warnings = [];

  if (!sourceIpDetails.configuredIp) {
    warnings.push(
      "EKO_SOURCE_IP is not set. The server is using detected public IP instead.",
    );
  }

  if (
    sourceIpDetails.configuredIp &&
    !sourceIpDetails.configuredMatchesServer
  ) {
    warnings.push(
      "Configured EKO_SOURCE_IP does not match the server public IP. EKO allowlisting may fail.",
    );
  }

  if (
    sourceIpDetails.requestIp &&
    sourceIpDetails.requestIp !== sourceIpDetails.finalIp
  ) {
    warnings.push(
      "Request IP and BBPS source IP differ. This is expected when the client IP is not the server egress IP.",
    );
  }

  const readiness = {
    config,
    requestIp: sourceIpDetails.requestIp,
    sourceIp: sourceIpDetails.finalIp,
    sourceIpSource: sourceIpDetails.source,
    configuredSourceIp: sourceIpDetails.configuredIp,
    publicServerIp: sourceIpDetails.publicServerIp,
    warnings,
    canAttemptFetchBill:
      Object.values(coreConfig).every(Boolean) &&
      Boolean(sourceIpDetails.finalIp) &&
      config.sourceIpMatchesServer,
  };

  if (!operatorId) {
    return readiness;
  }

  try {
    const operatorDetails = await exports.getOperatorDetails(operatorId);

    readiness.operator = {
      operatorId: String(operatorId),
      fetched: true,
      details: operatorDetails,
    };
  } catch (error) {
    readiness.operator = {
      operatorId: String(operatorId),
      fetched: false,
      message: error.response?.data?.message || error.message,
      statusCode: error.response?.status || 500,
    };
  }

  return readiness;
};

exports.fetchBill = async (body, req) => {
  if (
    !BASE ||
    !process.env.EKO_DEVELOPER_KEY ||
    !process.env.EKO_ACCESS_KEY ||
    !process.env.EKO_USER_CODE ||
    !process.env.EKO_INITIATOR_ID
  ) {
    const envErr = new Error("Missing BBPS provider environment configuration");
    envErr.statusCode = 500;
    throw envErr;
  }

  try {
    const headers = await headerUtil.fetchHeaders();
    const sourceIp = await getBbpsSourceIP(req);
    const { operator_id, ...dynamicParams } = body || {};
    const requestIp = getClientIP(req);

    console.info("[BBPS][fetch-bill][incoming]", {
      operator_id,
      dynamicKeys: Object.keys(dynamicParams),
      requestIp,
      finalSourceIp: sourceIp,
    });

    const payload = {
      operator_id,
      ...dynamicParams,
      user_code: process.env.EKO_USER_CODE,
      client_ref_id: Date.now().toString(),
      hc_channel: "0",
      source_ip: sourceIp,
    };

    console.info("[BBPS][provider][fetch-bill] payload", {
      operator_id: payload.operator_id,
      client_ref_id: payload.client_ref_id,
      source_ip: payload.source_ip,
      dynamicKeys: Object.keys(body || {}).filter(
        (key) => !["operator_id"].includes(key),
      ),
    });

    console.info("[BBPS][provider][fetch-bill] request-meta", {
      initiator_id: process.env.EKO_INITIATOR_ID,
      source_ip: payload.source_ip,
      endpoint: ekoUrl(
        `billpayments/fetchbill?initiator_id=${process.env.EKO_INITIATOR_ID}`,
      ),
    });

    const res = await retry(
      () =>
        axios.post(
          ekoUrl(
            `billpayments/fetchbill?initiator_id=${process.env.EKO_INITIATOR_ID}`,
          ),
          payload,
          { headers, timeout: FETCH_BILL_TIMEOUT_MS },
        ),
      1,
    );

    console.info("[BBPS][provider][fetch-bill] response", {
      status: res.status,
      success: res.data?.success,
      message: res.data?.message,
      reason: res.data?.data?.reason,
      providerStatus: res.data?.status,
      responseTypeId: res.data?.response_type_id,
      responseStatusId: res.data?.response_status_id,
      responseKeys:
        res.data && typeof res.data === "object" ? Object.keys(res.data) : [],
      dataKeys:
        res.data?.data && typeof res.data.data === "object"
          ? Object.keys(res.data.data)
          : [],
    });

    if (res.data && typeof res.data === "object" && !Array.isArray(res.data)) {
      return {
        ...res.data,
        client_ref_id: res.data.client_ref_id || payload.client_ref_id,
      };
    }

    return res.data;
  } catch (error) {
    const normalizedError = normalizeProviderError(
      error,
      "Provider request failed",
    );

    console.error("[BBPS][provider][fetch-bill] error", {
      statusCode: normalizedError.statusCode,
      message: normalizedError.message,
      providerMessage: normalizedError.providerMessage,
    });

    throw normalizedError;
  }
};

// 5. Pay bill
exports.payBill = async (body, req) => {
  if (
    !BASE ||
    !process.env.EKO_DEVELOPER_KEY ||
    !process.env.EKO_ACCESS_KEY ||
    !process.env.EKO_USER_CODE ||
    !process.env.EKO_INITIATOR_ID
  ) {
    const envErr = new Error("Missing BBPS provider environment configuration");
    envErr.statusCode = 500;
    throw envErr;
  }

  const formattedAmount = headerUtil.formatPayBillAmount(body.amount);
  const headers = await headerUtil.payHeaders(
    body.utility_acc_no,
    formattedAmount,
    process.env.EKO_USER_CODE,
  );
  const sourceIp = await getBbpsSourceIP(req);

  const payload = {
    ...body,
    amount: formattedAmount,
    user_code: process.env.EKO_USER_CODE,
    client_ref_id: body.client_ref_id || Date.now().toString(),
    hc_channel: 0,
    source_ip: sourceIp,
    ...(process.env.EKO_LATLONG
      ? { latlong: process.env.EKO_LATLONG.trim() }
      : {}),
  };

  const endpoint = ekoUrl(
    `billpayments/paybill?initiator_id=${process.env.EKO_INITIATOR_ID}`,
  );

  console.info("[BBPS][provider][pay-bill] request-meta", {
    operator_id: payload.operator_id,
    amount: payload.amount,
    client_ref_id: payload.client_ref_id,
    source_ip: payload.source_ip,
    initiator_id_location: "query",
    hc_channel: payload.hc_channel,
    endpoint,
  });

  try {
    const res = await retry(
      () =>
        axios.post(endpoint, payload, {
          headers,
          timeout: FETCH_BILL_TIMEOUT_MS,
        }),
      0,
    );

    console.info("[BBPS][provider][pay-bill] response", {
      status: res.status,
      success: res.data?.success,
      message: res.data?.message,
      providerStatus: res.data?.status,
      responseTypeId: res.data?.response_type_id,
      responseStatusId: res.data?.response_status_id,
    });

    return res.data;
  } catch (error) {
    const normalizedError = normalizeProviderError(
      error,
      "Provider payment request failed",
    );

    console.error("[BBPS][provider][pay-bill] error", {
      statusCode: normalizedError.statusCode,
      message: normalizedError.message,
      providerMessage: normalizedError.providerMessage,
      providerBodyType: normalizedError.providerResponse.providerBodyType,
    });

    throw normalizedError;
  }
};
