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
    return res.data;
  } catch (err) {
    console.log("❌ Interakt 400 payload:", JSON.stringify(payload));
    console.log("❌ Interakt error response:", err.response?.status, err.response?.data);
    throw err;
  }
}

module.exports = { sendTemplateMessage };
