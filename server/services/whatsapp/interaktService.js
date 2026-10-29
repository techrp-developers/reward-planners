const axios = require("axios");
const { normalizeIndianMobile } = require("./phone");

async function sendTemplateMessage({
  phone,
  templateName,
  languageCode = "en",
  bodyValues = [],
  buttonValues = null,     
  headerValues = null,     
  callbackData = null,     
}) {
  const baseUrl = process.env.INTERAKT_BASE_URL;
  const apiKey = process.env.INTERAKT_API_KEY;
  const normalizedPhone = normalizeIndianMobile(phone);

  if (!baseUrl || !apiKey) {
    throw new Error("INTERAKT_CONFIG_MISSING");
  }

  if (!normalizedPhone) {
    const error = new Error("INTERAKT_PHONE_INVALID");
    error.code = "INTERAKT_PHONE_INVALID";
    throw error;
  }

  const phoneNumber = normalizedPhone.slice(3);

  const payload = {
    countryCode: "+91",
    phoneNumber,
    type: "Template",
    ...(callbackData ? { callbackData } : {}),
    template: {
      name: templateName,
      languageCode,
      ...(headerValues?.length ? { headerValues } : {}),
      bodyValues,
      ...(buttonValues && Object.keys(buttonValues).length ? { buttonValues } : {}),
    },
  };

  try {
    const res = await axios.post(baseUrl, payload, {
      headers: {
        Authorization: `Basic ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });
    if (res.data?.result !== true) {
      const error = new Error("INTERAKT_MESSAGE_REJECTED");
      error.code = "INTERAKT_MESSAGE_REJECTED";
      throw error;
    }
    return res.data;
  } catch (err) {
    // Never log the request body: authentication templates contain live OTPs.
    console.error("Interakt template request failed", {
      status: err.response?.status,
      code: err.code,
      templateName,
    });
    throw err;
  }
}

async function sendTextMessage({ phone, message, callbackData }) {
  const fullPhoneNumber = normalizeIndianMobile(phone);
  if (!fullPhoneNumber) throw new Error("INTERAKT_PHONE_INVALID");
  if (!process.env.INTERAKT_API_KEY || !process.env.INTERAKT_BASE_URL) {
    throw new Error("INTERAKT_CONFIG_MISSING");
  }
  // Same recipient shape as sendTemplateMessage, which is proven against this Interakt account.
  const { data } = await axios.post(process.env.INTERAKT_BASE_URL, {
    countryCode: "+91",
    phoneNumber: fullPhoneNumber.slice(3),
    ...(callbackData ? { callbackData } : {}),
    type: "Text",
    data: { message },
  }, {
    headers: { Authorization: `Basic ${process.env.INTERAKT_API_KEY}`, "Content-Type": "application/json" },
    timeout: 15000,
  });
  if (data?.result !== true) {
    const error = new Error("INTERAKT_MESSAGE_REJECTED");
    error.providerData = data;
    throw error;
  }
  return data;
}

module.exports = { sendTemplateMessage, sendTextMessage };
