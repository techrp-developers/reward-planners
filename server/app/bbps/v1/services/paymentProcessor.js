const ekoService = require("./eko_service");

const removeEmptyFields = (payload) =>
  Object.fromEntries(
    Object.entries(payload).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  );

const isEkoPaymentSuccessful = (result) => {
  if (!result || typeof result !== "object") {
    return false;
  }

  if (
    result.response_type_id === -1 ||
    Number(result.status) === 97 ||
    result.invalid_params
  ) {
    return false;
  }

  const normalizedStatus = String(result.status ?? "").trim().toUpperCase();
  return (
    result.success === true ||
    normalizedStatus === "0" ||
    normalizedStatus === "SUCCESS" ||
    normalizedStatus === "SUCCESSFUL"
  );
};

const processTransaction = async (txn, req) => {
  let result;

  try {
    result = await ekoService.payBill(
      removeEmptyFields({
        utility_acc_no: String(txn.utility_acc_no || "").trim(),
        operator_id: txn.operator_id,
        amount: txn.amount,
        cycle_number: txn.cycle_number,
        confirmation_mobile_no: txn.confirmation_mobile_no,
        sender_name: txn.sender_name,
        client_ref_id: txn.provider_client_ref_id,
        bbpstrxnrefid: txn.provider_bill_ref_id,
      }),
      req,
    );
  } catch (error) {
    const statusCode = error.response?.status || error.statusCode;

    if (
      statusCode >= 400 &&
      statusCode < 500 &&
      statusCode !== 408 &&
      statusCode !== 429
    ) {
      error.retryable = false;
    }

    if (!error.providerResponse) {
      error.providerResponse = {
        statusCode,
        message: error.message || "EKO payment request failed",
      };
    }

    throw error;
  }

  if (!isEkoPaymentSuccessful(result)) {
    const error = new Error(result?.message || "EKO rejected the payment");
    error.retryable = false;
    error.providerResponse = result;
    throw error;
  }

  return result;
};

module.exports = { processTransaction, isEkoPaymentSuccessful };
