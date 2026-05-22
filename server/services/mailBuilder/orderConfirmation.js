const { sendMail } = require("../mailService");
const { renderTemplate } = require("../../utils/templateRenderer");

async function orderConfirmationMail(data) {
  const html = renderTemplate("order-confirmation", {
    name: data.name,
    amount: data.amount,
    orderId: data.orderId,
    companyName: "Reward Planners",
  });

  await sendMail({
    to: data.email,
    subject: "Your order is confirmed",
    html,
  });
}

module.exports = {
  orderConfirmationMail,
};
