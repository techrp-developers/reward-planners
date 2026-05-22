const { sendMail } = require("../mailService");
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

  if (!template) return;

  const html = renderTemplate(template, variables);

  await sendMail({
    to: vendor.email,
    subject,
    html,
  });
}


module.exports = {
  notifyVendorStatusChange
};
