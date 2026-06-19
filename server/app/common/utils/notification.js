const NotificationModel = require("../models/notificationModel");
const { runNonBlocking } = require("../../../utils/nonBlocking");

function notifyUser(data, label = "notification") {
  if (!data?.userId && !data?.user_id) return;

  runNonBlocking(
    () =>
      NotificationModel.create({
        priority: "normal",
        reference_type: "none",
        ...data,
      }),
    label,
  );
}

module.exports = { notifyUser };
