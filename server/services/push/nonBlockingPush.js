const { runNonBlocking } = require("../../utils/nonBlocking");
const { sendDirectPushAndSave } = require("./separatePushService");

function stripNonLatin1(value) {
  if (value == null) return value;
  return String(value).replace(/[^\u0000-\u00FF]/g, "");
}

function sanitizePayload(data = {}) {
  return {
    ...data,
    module: stripNonLatin1(data.module),
    type: stripNonLatin1(data.type),
    title: stripNonLatin1(data.title),
    message: stripNonLatin1(data.message),
    icon: stripNonLatin1(data.icon),
    reference_type: stripNonLatin1(data.reference_type),
    reference_id:
      data.reference_id == null ? data.reference_id : String(data.reference_id),
    action_url: stripNonLatin1(data.action_url),
    screen: stripNonLatin1(data.screen),
    sound: data.sound || "default",
  };
}

function notifyUser(data, label = "notification") {
  const userId = data?.userId || data?.user_id;
  if (!userId) return;

  runNonBlocking(
    () =>
      sendDirectPushAndSave(
        sanitizePayload({
          priority: "normal",
          reference_type: "none",
          ...data,
          userId,
        }),
      ),
    label,
  );
}

module.exports = { notifyUser };
