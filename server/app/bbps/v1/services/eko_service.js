const axios = require("axios");
const { randomUUID } = require("crypto");
const headerUtil = require("../utils/header");
const retry = require("../utils/retry");
const {
  getBbpsSourceIP,
  getBbpsSourceIPDetails,
  getClientIP,
} = require("../utils/network");

const resolveBaseUrl = () => {
  // if (process.env.EKO_BASE_URL) {
  //   return process.env.EKO_BASE_URL;
  // }

  // const isProduction = process.env.NODE_ENV === "production";
  // return isProduction ? process.env.EKO_BASE_URL_PROD : process.env.EKO_BASE_URL_UAT;
  return process.env.EKO_BASE_URL_PROD;
};

const ensureTrailingSlash = (url = "") => {
  return url.endsWith("/") ? url : `${url}/`;
};

const BASE = ensureTrailingSlash(resolveBaseUrl() || "");
const ekoUrl = (path) => `${BASE}${path}`;

// 0. Get Locations
exports.getLocations = async () => {
  const headers = await headerUtil.fetchHeaders();
  const res = await axios.get(ekoUrl("billpayments/operators_location"), {
    headers,
  });
  return res.data;
};

// 1. Categories
exports.getCategories = async () => {
  const headers = await headerUtil.fetchHeaders();
  const res = await axios.get(ekoUrl("billpayments/operators_category"), {
    headers,
  });
  return res.data;
};

// 2. Operators
exports.getOperators = async (category_id) => {
  const headers = await headerUtil.fetchHeaders();

  const res = await axios.get(ekoUrl("billpayments/operators"), { headers });

  let operators = res.data?.data || [];

  if (category_id) {
    operators = operators.filter((op) => op.operator_category == category_id);
  }

  return {
    ...res.data,
    data: operators,
  };
};

// 2.5 Grouped operators
exports.getOperatorsGrouped = async (category_id, search = "") => {
  const headers = await headerUtil.fetchHeaders();

  const [operatorsRes, locationRes] = await Promise.all([
    axios.get(ekoUrl("billpayments/operators"), { headers }),
    axios.get(ekoUrl("billpayments/operators_location"), { headers }),
  ]);

  let operators = operatorsRes.data?.data || [];
  const locations = locationRes.data?.data || [];

  //  STEP 1: FILTER BY CATEGORY_ID
  operators = operators.filter((op) => op.operator_category == category_id);

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

// 3. Operator details
exports.getOperatorDetails = async (id) => {
  const headers = await headerUtil.fetchHeaders();
  const res = await axios.get(ekoUrl(`billpayments/operators/${id}`), {
    headers,
  });
  return res.data;
};

exports.getFetchBillReadiness = async (req, operatorId) => {
  const sourceIpDetails = await getBbpsSourceIPDetails(req);
  const coreConfig = {
    baseUrlConfigured: Boolean(BASE),
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
      client_ref_id: randomUUID(),
      hc_channel: "0",
      source_ip: sourceIp,
    };

    console.info("[BBPS][provider][fetch-bill] payload", {
      operator_id: payload.operator_id,
      utility_acc_no: payload.utility_acc_no,
      confirmation_mobile_no: payload.confirmation_mobile_no,
      client_ref_id: payload.client_ref_id,
      source_ip: payload.source_ip,
      dynamicKeys: Object.keys(body || {}).filter(
        (key) => !["operator_id"].includes(key),
      ),
    });

    console.info("[BBPS][provider][fetch-bill] request-meta", {
      initiator_id: process.env.EKO_INITIATOR_ID,
      source_ip: payload.source_ip,
      headers,
      endpoint: ekoUrl(
        `billpayments/fetchbill?initiator_id=${process.env.EKO_INITIATOR_ID}`,
      ),
    });

    const res = await retry(() =>
      axios.post(
        ekoUrl(
          `billpayments/fetchbill?initiator_id=${process.env.EKO_INITIATOR_ID}`,
        ),
        payload,
        { headers, timeout: 15000 },
      ),
    );

    console.info("[BBPS][provider][fetch-bill] response", {
      status: res.status,
      success: res.data?.success,
      message: res.data?.message,
      response: res.data,
    });

    return res.data;
  } catch (error) {
    const statusCode = error.response?.status || 500;
    const providerData = error.response?.data;
    const hasHtmlBody =
      typeof providerData === "string" && /<\s*html/i.test(providerData);
    const providerMessage =
      (typeof providerData === "object" &&
        (providerData?.message || providerData?.error)) ||
      (typeof providerData === "string" && !hasHtmlBody
        ? providerData
        : null) ||
      error.message;

    const normalizedError = new Error(
      statusCode === 401
        ? "Provider authorization failed"
        : statusCode === 403
          ? "Provider access forbidden"
          : providerMessage || "Provider request failed",
    );
    normalizedError.statusCode = statusCode;
    normalizedError.details =
      providerData && typeof providerData === "object"
        ? providerData
        : undefined;

    console.error("[BBPS][provider][fetch-bill] error", {
      statusCode,
      message: normalizedError.message,
      providerData,
    });

    throw normalizedError;
  }
};

// 5. Pay bill
exports.payBill = async (body, req) => {
  const headers = await headerUtil.payHeaders(
    body.utility_acc_no,
    body.amount,
    process.env.EKO_USER_CODE,
  );
  const sourceIp = await getBbpsSourceIP(req);

  const payload = {
    ...body,
    user_code: process.env.EKO_USER_CODE,
    client_ref_id: Date.now(),
    hc_channel: "0",
    source_ip: sourceIp,
  };

  const res = await retry(() =>
    axios.post(
      ekoUrl(
        `billpayments/paybill?initiator_id=${process.env.EKO_INITIATOR_ID}`,
      ),
      payload,
      { headers, timeout: 10000 },
    ),
  );

  return res.data;
};
