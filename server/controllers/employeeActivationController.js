const EmployeeModel = require("../models/employeeModel");
const { sendMail } = require("../services/mailService");
const { sendTemplateMessage } = require("../services/whatsapp/interaktService");
const { normalizeIndianMobile } = require("../services/whatsapp/phone");

const ACTIVATION_WHATSAPP_TEMPLATE = "rp_pending_account_activation";

// Resolves the company-scoped employee and rejects accounts that are already active.
// Sends the error response itself and returns null when the reminder must not go out.
async function findPendingEmployee(req, res) {
  const companyId = Number(req.user?.role === "hr" ? req.user.company_id : req.params.companyId);
  const employeeId = Number(req.params.employeeId || req.params.id);
  if (![companyId, employeeId].every((id) => Number.isSafeInteger(id) && id > 0)) {
    res.status(400).json({ success: false, message: "Invalid company or employee ID" });
    return null;
  }
  const employee = await EmployeeModel.findById(employeeId, companyId);
  if (!employee) {
    res.status(404).json({ success: false, message: "Employee not found" });
    return null;
  }
  if (employee.customer_id && Number(employee.customer_is_active) === 1) {
    res.status(409).json({ success: false, message: "This employee's account is already activated" });
    return null;
  }
  return employee;
}

async function sendActivationEmail(req, res) {
  try {
    const employee = await findPendingEmployee(req, res);
    if (!employee) return res;
    const email = String(employee.email || "").trim();
    if (!/^[^\s@<>(),;:]+@[^\s@<>(),;:]+\.[^\s@<>(),;:]+$/.test(email)) {
      return res.status(400).json({ success: false, message: "This employee does not have a valid email address" });
    }
    await sendMail({
      to: email,
      subject: "Activate your Reward Planners account",
      text: `Hello ${employee.name},\n\nYour Reward Planners account has not yet been activated. Please open the Reward Planners app and complete account registration using the contact details registered with your company.\n\nIf you have already registered but cannot access your account, please contact your HR team for help.\n\nThank you,\nReward Planners`,
    });
    return res.json({ success: true, message: "Activation email sent successfully" });
  } catch (error) {
    console.error("Employee activation email failed:", error.message);
    return res.status(503).json({ success: false, message: "Unable to send the activation email. Please try again later." });
  }
}

async function sendActivationWhatsApp(req, res) {
  try {
    const employee = await findPendingEmployee(req, res);
    if (!employee) return res;
    // Always the number stored on the employee record, never one from the request.
    const phone = normalizeIndianMobile(employee.phone);
    if (!phone) {
      return res.status(400).json({ success: false, message: "This employee does not have a valid Indian mobile number" });
    }
    await sendTemplateMessage({
      phone,
      templateName: ACTIVATION_WHATSAPP_TEMPLATE,
      bodyValues: [String(employee.name || "").trim() || "there"],
      callbackData: JSON.stringify({ source: "activation_reminder", senderId: req.user?.user_id, employeeId: employee.id }),
    });
    return res.json({ success: true, message: "Activation WhatsApp message sent" });
  } catch (error) {
    if (error.message === "INTERAKT_CONFIG_MISSING") {
      return res.status(503).json({ success: false, message: "WhatsApp messaging is not configured. Contact your administrator." });
    }
    const providerStatus = error.response?.status;
    console.error("Employee activation WhatsApp failed:", error.code || error.message, providerStatus || "");
    if (providerStatus >= 400 && providerStatus < 500) {
      return res.status(422).json({ success: false, message: "WhatsApp rejected the message. Check that the activation template is approved in Interakt." });
    }
    return res.status(503).json({ success: false, message: "Unable to send the activation WhatsApp message. Please try again later." });
  }
}

module.exports = { sendActivationEmail, sendActivationWhatsApp };
