const { sendMailBestEffort } = require("../mailService");
const { renderTemplate } = require("../../utils/templateRenderer");

async function orderConfirmationMail(data) {
  const html = renderTemplate("order-confirmation", {
    name: data.name,
    amount: data.amount,
    orderId: data.orderId,
    companyName: "Reward Planners",
  });

  return sendMailBestEffort({
    to: data.email,
    subject: "Your order is confirmed",
    html,
  }, "order confirmation mail");
}

module.exports = {
  orderConfirmationMail,
};
