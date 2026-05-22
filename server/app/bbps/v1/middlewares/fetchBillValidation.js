const CONSUMER_NUMBER_REGEX = /^[A-Za-z0-9._@\/-]{4,64}$/;

const fetchBillValidation = (req, res, next) => {
  const { operator_id, consumer_number, utility_acc_no } = req.body || {};

  if (!operator_id || String(operator_id).trim() === "") {
    return res.status(400).json({
      success: false,
      message: "operator_id is required",
    });
  }

  const normalizedConsumer = String(consumer_number || "").trim();
  const normalizedUtilityAccount = String(utility_acc_no || "").trim();

  if (normalizedConsumer && !CONSUMER_NUMBER_REGEX.test(normalizedConsumer)) {
    return res.status(400).json({
      success: false,
      message:
        "consumer_number is invalid. Use 4-64 chars and only letters, digits, ., _, -, /, @",
    });
  }

  if (normalizedUtilityAccount && !CONSUMER_NUMBER_REGEX.test(normalizedUtilityAccount)) {
    return res.status(400).json({
      success: false,
      message:
        "utility_acc_no is invalid. Use 4-64 chars and only letters, digits, ., _, -, /, @",
    });
  }

  req.body.operator_id = String(operator_id).trim();

  if (normalizedConsumer) {
    req.body.consumer_number = normalizedConsumer;
  }

  if (normalizedUtilityAccount) {
    req.body.utility_acc_no = normalizedUtilityAccount;
  }

  return next();
};

module.exports = fetchBillValidation;
