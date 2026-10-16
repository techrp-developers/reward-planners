const EmployeeModel = require("../models/employeeModel");
const { sendMail } = require("../services/mailService");

async function sendActivationEmail(req, res) {
  const companyId = Number(req.user?.role === "hr" ? req.user.company_id : req.params.companyId);
  const employeeId = Number(req.params.employeeId || req.params.id);
  if (![companyId, employeeId].every((id) => Number.isSafeInteger(id) && id > 0)) {
    return res.status(400).json({ success: false, message: "Invalid company or employee ID" });
  }
  try {
    const employee = await EmployeeModel.findById(employeeId, companyId);
    if (!employee) return res.status(404).json({ success: false, message: "Employee not found" });
    if (employee.customer_id && Number(employee.customer_is_active) === 1) {
      return res.status(409).json({ success: false, message: "This employee's account is already activated" });
    }
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

module.exports = { sendActivationEmail };
