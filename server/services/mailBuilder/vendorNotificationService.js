const { sendMailBestEffort } = require("../mailService");
const { renderTemplate } = require("../../utils/templateRenderer");

async function notifyVendorStatusChange(vendor, status) {
  let template;
  let subject;
  let variables = {
    vendorName: vendor.full_name,
    companyName: "Reward Planners",
  };

  if (status === "approved") {
    template = "vendor-approved";
    subject = "Your Vendor Account Has Been Approved";
  }

  if (status === "rejected") {
    template = "vendor-rejected";
    subject = "Your Vendor Account Has Been Rejected";
    variables.rejectionReason = vendor.rejection_reason;
  }

  if (status === "resubmission") {
    template = "vendor-resubmission";
    subject = "Updates Requested for Your Vendor Onboarding";
    variables.rejectionReason = vendor.rejection_reason;
  }

  if (status === "pending" || status === "sent_for_approval") {
    template = "vendor-pending";
    subject = "Your Vendor Onboarding Is Under Review";
  }

  if (!template) return;

  const html = renderTemplate(template, variables);

  return sendMailBestEffort({
    to: vendor.email,
    subject,
    html,
  }, "vendor status mail");
}

async function notifyVendorOnboardingSubmitted(vendor, manager) {
  const vendorMail = notifyVendorStatusChange(vendor, "sent_for_approval");
  const managerMail = manager?.email
    ? sendMailBestEffort({
        to: manager.email,
        subject: `Vendor onboarding submitted: ${vendor.company_name || vendor.full_name}`,
        html: `<p>Hello ${manager.name || "Vendor Manager"},</p><p><strong>${vendor.company_name || vendor.full_name}</strong> has submitted vendor onboarding for review.</p>`,
      }, "vendor onboarding manager mail")
    : Promise.resolve({ ok: false, skipped: true });
  return Promise.all([vendorMail, managerMail]);
}


module.exports = {
  notifyVendorStatusChange,
  notifyVendorOnboardingSubmitted,
};
