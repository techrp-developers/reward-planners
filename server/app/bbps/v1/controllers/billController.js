const ekoService = require("../services/eko_service");
const TransactionModel = require("../models/transactionModel");

/**
 * @typedef {Object} FrontendFetchBillPayload
 * @property {string} operator_id
 * @property {string=} consumer_number
 * @property {string=} mobile_number
 */

/**
 * @typedef {Object} EkoFetchBillError
 * @property {number=} status
 * @property {number=} response_type_id
 * @property {string=} message
 * @property {Record<string, string>=} invalid_params
 */

const pickFirstValue = (sources, keys) => {
  for (const source of sources) {
    if (!source || typeof source !== "object") {
      continue;
    }

    for (const key of keys) {
      const value = source[key];

      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
  }

  return null;
};

const normalizeFetchBillResponse = (providerResponse, requestPayload) => {
  const root =
    providerResponse && typeof providerResponse === "object"
      ? providerResponse
      : {};
  const levelOneData =
    root.data && typeof root.data === "object" ? root.data : null;
  const levelTwoData =
    levelOneData?.data && typeof levelOneData.data === "object"
      ? levelOneData.data
      : null;
  const bill =
    levelOneData?.bill && typeof levelOneData.bill === "object"
      ? levelOneData.bill
      : null;

  const sources = [levelTwoData, bill, levelOneData, root];

  const customerName = pickFirstValue(sources, [
    "customer_name",
    "customerName",
    "name",
    "consumer_name",
    "biller_name",
  ]);
  const amount = pickFirstValue(sources, [
    "amount",
    "bill_amount",
    "billAmount",
    "due_amount",
    "total_amount",
  ]);
  const dueDate = pickFirstValue(sources, [
    "due_date",
    "dueDate",
    "bill_due_date",
  ]);
  const billNumber = pickFirstValue(sources, [
    "bill_number",
    "billNumber",
    "bill_no",
    "reference_id",
    "referenceId",
  ]);
  const billDate = pickFirstValue(sources, [
    "bill_date",
    "billDate",
    "billing_date",
  ]);

  return {
    customer: {
      consumerNumber:
        requestPayload.consumer_number || requestPayload.utility_acc_no,
      operatorId: requestPayload.operator_id,
      customerName,
    },
    bill: {
      amount,
      dueDate,
      billNumber,
      billDate,
    },
    raw: providerResponse,
  };
};

const extractOperatorRecord = (operatorData) => {
  if (!operatorData) return null;

  // EKO MOST COMMON FORMAT
  if (Array.isArray(operatorData?.data) && operatorData.data.length > 0) {
    return operatorData.data[0];
  }

  // Nested case (some APIs wrap again)
  if (
    Array.isArray(operatorData?.data?.data) &&
    operatorData.data.data.length > 0
  ) {
    return operatorData.data.data[0];
  }

  // Sometimes direct array
  if (Array.isArray(operatorData) && operatorData.length > 0) {
    return operatorData[0];
  }

  // Already a clean operator object (has operator_id)
  if (typeof operatorData === "object" && operatorData.operator_id) {
    return operatorData;
  }

  return null;
};

const isFetchBillSupported = (operatorRecord) => {
  const rawFlag =
    operatorRecord?.fetchBill ??
    operatorRecord?.fetch_bill ??
    operatorRecord?.fetchbill ??
    operatorRecord?.is_fetch_bill ??
    operatorRecord?.supports_fetch_bill;

  if (rawFlag === undefined || rawFlag === null || rawFlag === "") {
    return true;
  }

  const normalized = String(rawFlag).trim().toLowerCase();

  return ["1", "true", "yes", "y"].includes(normalized);
};

const toArray = (value) => {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
};

const normalizeParamName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();
const hasValue = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const getFirstFromKeys = (payload, keys) => {
  for (const key of keys) {
    if (hasValue(payload?.[key])) {
      return String(payload[key]).trim();
    }
  }

  return "";
};

const parseInputParams = (operatorRecord) => {
  const rawInputParams =
    operatorRecord?.input_params ??
    operatorRecord?.inputParams ??
    operatorRecord?.operator_input_params ??
    operatorRecord?.params ??
    operatorRecord?.data;

  if (!rawInputParams) {
    return [];
  }

  let paramsList = rawInputParams;

  if (typeof paramsList === "string") {
    try {
      paramsList = JSON.parse(paramsList);
    } catch (error) {
      paramsList = [];
    }
  }

  return toArray(paramsList)
    .map((item) => {
      if (!item) {
        return null;
      }

      if (typeof item === "string") {
        return { name: normalizeParamName(item), required: true };
      }

      const name = normalizeParamName(
        item.param_name || item.name || item.key || item.field || item.label,
      );

      if (!name) {
        return null;
      }

      const rawRequired =
        item.is_mandatory ??
        item.mandatory ??
        item.required ??
        item.is_required ??
        item.isRequired;

      const required =
        rawRequired === undefined
          ? true
          : ["1", "true", "yes", "y"].includes(
              String(rawRequired).trim().toLowerCase(),
            );

      return { name, required };
    })
    .filter(Boolean);
};

const getFieldAliases = (name) => {
  const normalized = normalizeParamName(name);

  if (normalized === "utility_acc_no") {
    return ["utility_acc_no", "consumer_number", "consumerNumber"];
  }

  if (normalized === "confirmation_mobile_no") {
    return [
      "confirmation_mobile_no",
      "mobile_number",
      "mobileNo",
      "mobile_no",
      "mobile",
    ];
  }

  return [name];
};

/**
 * Converts frontend payload into EKO payload using operator input parameters.
 * @param {FrontendFetchBillPayload & Record<string, any>} requestBody
 * @param {Record<string, any>} operatorRecord
 */
const normalizeFetchBillRequest = (requestBody, operatorRecord) => {
  const normalizedOperatorId = String(requestBody?.operator_id || "").trim();

  const inputParams = parseInputParams(operatorRecord) || [];
  const requiredParams = inputParams.filter((param) => param.required);

  const providerPayload = {
    operator_id: normalizedOperatorId,
  };

  // =========================
  // 1. MAP REQUIRED PARAMS (from operator config)
  // =========================
  for (const param of requiredParams) {
    const value = getFirstFromKeys(requestBody, getFieldAliases(param.name));

    if (hasValue(value)) {
      providerPayload[param.name] = String(value).trim();
    }
  }

  // =========================
  // 2. MAP ALL OTHER PARAMS (fallback)
  // =========================
  Object.entries(requestBody || {}).forEach(([key, value]) => {
    if (!hasValue(value) || key === "operator_id") return;

    if (providerPayload[key] === undefined) {
      providerPayload[key] = String(value).trim();
    }
  });

  // =========================
  // 3. ENSURE utility_acc_no (CRITICAL)
  // =========================
  if (!hasValue(providerPayload.utility_acc_no)) {
    const accountNo = getFirstFromKeys(requestBody, [
      "utility_acc_no",
      "consumer_number",
      "consumerNumber",
    ]);

    if (hasValue(accountNo)) {
      providerPayload.utility_acc_no = String(accountNo).trim();
    }
  }

  // =========================
  // 4. ENSURE confirmation_mobile_no (CRITICAL FIX)
  // =========================
  if (!hasValue(providerPayload.confirmation_mobile_no)) {
    const mobileNo = getFirstFromKeys(requestBody, [
      "confirmation_mobile_no",
      "mobile_number",
      "mobileNo",
      "mobile_no",
      "mobile",
    ]);

    if (hasValue(mobileNo)) {
      providerPayload.confirmation_mobile_no = String(mobileNo).trim();
    }
  }

  // =========================
  // 5. BUILD missingRequired (FIXED)
  // =========================
  let missingRequired = requiredParams
    .map((param) => param.name)
    .filter((name) => !hasValue(providerPayload[name]));

  // Always enforce these
  if (!hasValue(providerPayload.utility_acc_no)) {
    missingRequired.push("utility_acc_no");
  }

  const requiresMobile = inputParams.some(
    (p) => p.name === "confirmation_mobile_no" && p.required,
  );

  if (requiresMobile && !hasValue(providerPayload.confirmation_mobile_no)) {
    missingRequired.push("confirmation_mobile_no");
  }
  // remove duplicates
  missingRequired = Array.from(new Set(missingRequired));

  // =========================
  // 6. RETURN
  // =========================
  return {
    providerPayload,
    inputParams,
    missingRequired,
    frontendPayload: {
      operator_id: normalizedOperatorId,
      consumer_number: providerPayload.utility_acc_no || "",
      mobile_number: providerPayload.confirmation_mobile_no || "",
    },
  };
};
/**
 * @param {EkoFetchBillError | Record<string, any>} providerResponse
 */
const isProviderValidationError = (providerResponse) => {
  if (!providerResponse || typeof providerResponse !== "object") {
    return false;
  }

  return (
    providerResponse.response_type_id === -1 ||
    providerResponse.status === 97 ||
    Boolean(providerResponse.invalid_params) ||
    /no key for response/i.test(String(providerResponse.message || ""))
  );
};

const hasProviderBillData = (providerResponse) => {
  if (!providerResponse || typeof providerResponse !== "object") {
    return false;
  }

  const root = providerResponse;

  const levelOneData =
    root.data && typeof root.data === "object" ? root.data : null;

  const levelTwoData =
    levelOneData?.data && typeof levelOneData.data === "object"
      ? levelOneData.data
      : null;

  const bill =
    levelOneData?.bill && typeof levelOneData.bill === "object"
      ? levelOneData.bill
      : null;

  const sources = [levelTwoData, bill, levelOneData, root];

  for (const source of sources) {
    if (!source || typeof source !== "object") continue;

    const amount = source.amount || source.bill_amount || source.billAmount;

    const customerName =
      source.customer_name || source.consumer_name || source.name;

    //  STRICT CHECK
    if (hasValue(amount) && hasValue(customerName)) {
      return true;
    }
  }

  return false;
};

class BillController {
  constructor() {
    this.fetchBill = this.fetchBill.bind(this);
    this.checkCustomerNumber = this.checkCustomerNumber.bind(this);
  }

  async getFetchBillReadiness(req, res) {
    try {
      const { operator_id } = req.query;
      const data = await ekoService.getFetchBillReadiness(req, operator_id);

      return res.status(200).json({
        success: true,
        message: "BBPS fetch bill readiness fetched successfully",
        data,
      });
    } catch (error) {
      console.error("[BBPS][fetch-bill][readiness] error", error.message);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch BBPS readiness",
      });
    }
  }

  async getCategories(req, res) {
    try {
      const data = await ekoService.getCategories();
      res.json(data);
    } catch (e) {
      console.error("EKO ERROR:", e.response?.data || e.message);
      if (e.response?.status === 500) {
        return res.status(503).json({
          success: false,
          message: "Service temporarily unavailable. Please try again.",
        });
      }
    }
  }

  async getOperators(req, res) {
    try {
      const { category_id } = req.query;

      const data = await ekoService.getOperators(category_id);

      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }

  // Get Grouped operators
  async getGroupedOperators(req, res) {
    try {
      const { category_id, search } = req.query;

      if (!category_id) {
        return res.status(400).json({
          success: false,
          message: "category_id is required",
        });
      }

      const data = await ekoService.getOperatorsGrouped(category_id, search);

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error("EKO ERROR:", error.response?.data || error.message);

      res.status(500).json({
        success: false,
        message: "Failed to fetch grouped operators",
        error: error.message,
      });
    }
  }

  async getOperatorDetails(req, res) {
    try {
      const data = await ekoService.getOperatorDetails(req.params.id);
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }

  async checkCustomerNumber(req, res) {
    try {
      const operatorId = String(req.body?.operator_id || "").trim();

      if (!operatorId) {
        return res.status(400).json({
          success: false,
          message: "operator_id is required",
        });
      }

      const operatorData = await ekoService.getOperatorDetails(operatorId);
      const operatorRecord = extractOperatorRecord(operatorData);

      if (!operatorRecord) {
        return res.status(400).json({
          success: false,
          message: "Invalid operator_id or operator not found",
        });
      }

      if (!isFetchBillSupported(operatorRecord)) {
        return res.status(400).json({
          success: false,
          message: "Fetch bill is not supported for this operator",
        });
      }

      req.bbpsOperatorRecord = operatorRecord;

      return this.fetchBill(req, res);
    } catch (error) {
      console.error("[BBPS][check-customer-number] error", {
        message: error.message,
        statusCode: error.response?.status || 500,
        provider: error.response?.data || null,
      });

      return res.status(500).json({
        success: false,
        message: "Failed to validate operator for fetch bill",
      });
    }
  }

  async fetchBill(req, res) {
    try {
      const { operator_id } = req.body || {};
      // const userId = req.user?.user_id;
      const userId = 1;
      const operatorId = String(operator_id || "").trim();

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      if (!operatorId) {
        return res.status(400).json({
          success: false,
          message: "operator_id is required",
        });
      }

      let operatorRecord = req.bbpsOperatorRecord || null;

      if (!operatorRecord) {
        const operatorData = await ekoService.getOperatorDetails(operatorId);
        operatorRecord = extractOperatorRecord(operatorData);
      }

      if (!operatorRecord) {
        return res.status(400).json({
          success: false,
          message: "Invalid operator_id or operator not found",
        });
      }

      if (!isFetchBillSupported(operatorRecord)) {
        return res.status(400).json({
          success: false,
          message: "Fetch bill is not supported for this operator",
        });
      }

      const normalizedRequest = normalizeFetchBillRequest(
        req.body || {},
        operatorRecord,
      );

      if (normalizedRequest.missingRequired.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields for selected operator",
          data: {
            missing: normalizedRequest.missingRequired,
            expected: normalizedRequest.inputParams.map((param) => ({
              name: param.name,
              required: param.required,
            })),
          },
        });
      }

      console.info("[BBPS][fetch-bill] request", {
        operator_id: operatorId,
        frontendPayload: normalizedRequest.frontendPayload,
        providerPayload: normalizedRequest.providerPayload,
        operatorInputParams: normalizedRequest.inputParams,
        user_id: userId,
      });

      const data = await ekoService.fetchBill(
        normalizedRequest.providerPayload,
        req,
      );

      console.info("[BBPS][fetch-bill] provider-response", {
        operator_id: operatorId,
        response: data,
      });

      if (isProviderValidationError(data)) {
        const providerMessage = /no key for response/i.test(
          String(data?.message || ""),
        )
          ? "Provider returned an invalid fetch bill response. Please verify operator input mapping and EKO configuration."
          : data?.message || "Provider validation failed";

        return res.status(400).json({
          success: false,
          message: providerMessage,
          data,
        });
      }

      if (!hasProviderBillData(data)) {
        return res.status(502).json({
          success: false,
          message:
            "Provider response did not contain bill data. Please verify operator required fields and EKO mapping.",
          data,
        });
      }

      const normalized = normalizeFetchBillResponse(data, {
        operator_id: operatorId,
        consumer_number: normalizedRequest.frontendPayload.consumer_number,
        utility_acc_no: normalizedRequest.providerPayload.utility_acc_no,
      });

      return res.status(200).json({
        success: true,
        message: "Bill details fetched successfully",
        data: normalized,
      });
    } catch (e) {
      const statusCode = e.statusCode || e.response?.status || 500;
      const safeDetails =
        e.details && typeof e.details === "object" ? e.details : undefined;
      const message =
        statusCode === 403
          ? "Provider access is forbidden. Please verify BBPS credentials and allowlist settings."
          : e.message || "Failed to fetch bill details";

      console.error("[BBPS][fetch-bill] error", {
        statusCode,
        message,
        provider: safeDetails || e.response?.data || e.response?.status,
      });

      return res.status(statusCode).json({
        success: false,
        message,
        ...(safeDetails ? { data: safeDetails } : {}),
      });
    }
  }

  async checkStatus(req, res) {
    try {
      const { transaction_id } = req.params;

      // const userId = req.user?.user_id;
      const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      if (!transaction_id) {
        return res.status(400).json({
          success: false,
          message: "transaction_id required",
        });
      }

      // =========================
      // 1. GET TRANSACTION
      // =========================
      const txn = await TransactionModel.getById(transaction_id);

      if (!txn) {
        return res.status(404).json({
          success: false,
          message: "Transaction not found",
        });
      }

      if (txn.user_id !== userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      // =========================
      // 2. GET PAYMENT (razorpay_orders)
      // =========================
      const [rpOrderRows] = await db.execute(
        `SELECT razorpay_order_id, razorpay_payment_id, status 
       FROM razorpay_orders 
       WHERE ref_id = ? AND module='bbps'`,
        [transaction_id],
      );

      const rpOrder = rpOrderRows[0] || null;

      // =========================
      // 3. MAP STATUS FOR FRONTEND
      // =========================
      let finalStatus = "PENDING";

      if (txn.bbps_status === "PAID") {
        finalStatus = "SUCCESS";
      } else if (txn.bbps_status === "FAILED_FINAL") {
        finalStatus = "FAILED";
      } else if (txn.bbps_status === "FAILED_RETRY") {
        finalStatus = "RETRYING";
      } else if (txn.bbps_status === "INIT") {
        finalStatus = "PENDING";
      }

      // =========================
      // 4. RESPONSE
      // =========================
      return res.json({
        success: true,
        data: {
          transaction_id: txn.id,
          operator_id: txn.operator_id,
          amount: txn.amount,

          bbps_status: txn.bbps_status,
          payment_status: rpOrder?.status || "unknown",

          final_status: finalStatus,

          retry_count: txn.retry_count,
          max_retry: txn.max_retry,

          razorpay: rpOrder
            ? {
                order_id: rpOrder.razorpay_order_id,
                payment_id: rpOrder.razorpay_payment_id,
              }
            : null,

          response: txn.bbps_response ? JSON.parse(txn.bbps_response) : null,
        },
      });
    } catch (err) {
      console.error("checkStatus error:", err);

      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }
}

module.exports = new BillController();
