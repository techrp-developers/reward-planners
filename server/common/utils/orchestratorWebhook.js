const crypto = require("crypto");

const ecommerceWebhook = require("./paymentWebHook");
const serviceWebhook = require("../../app/service/v1/utils/webhook");
const bbpsWebhook = require("../../app/bbps/v1/utils/webhook");

async function handleWebhook(req, res) {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    const rawBody = req.body;

    //  Verify signature ONCE
    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    if (expected !== signature) {
      return res.status(400).send("Invalid signature");
    }

    //  Parse once
    const body = JSON.parse(rawBody.toString());

    //  Attach parsed body so child handlers don't re-parse
    req.parsedBody = body;

    //  FAN-OUT (parallel execution)
    // await Promise.all([
    //   ecommerceWebhook.processEvent(req),
    //   serviceWebhook.processEvent(req),
    // ]);

    if (!body?.payload?.payment?.entity) {
      console.warn("Unhandled webhook event", body.event);
      return res.sendStatus(200);
    }

    const moduleType = body?.payload?.payment?.entity?.notes?.module;

    const handler =
      moduleType === "service"
        ? serviceWebhook
        : moduleType === "ecommerce"
          ? ecommerceWebhook
          : moduleType === "bbps"
            ? bbpsWebhook
            : null;

    if (!handler) {
      console.warn("Unknown module in webhook", {
        event: body.event,
        notes: body?.payload?.payment?.entity?.notes,
      });
      return res.sendStatus(200);
    }

    await handler.processEvent(req);
    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook Orchestrator Error:", err);
    res.sendStatus(500);
  }
}

module.exports = { handleWebhook };
