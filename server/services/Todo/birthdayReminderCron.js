const cron = require("node-cron");
const db = require("../../config/database");
const { notifyUserAndWait } = require("../../app/common/utils/notification");
const SCHEDULE_TIMEZONE = process.env.SCHEDULE_TIMEZONE || "Asia/Kolkata";

// Run every day at 9:00 AM: "0 9 * * *"
// For testing purposes, you can change this to "* * * * *" to run every minute
cron.schedule("0 9 * * *", async () => {
  console.log("[Cron] Checking for employee birthdays today...");
  await sendBirthdayWishes();
}, { timezone: SCHEDULE_TIMEZONE, noOverlap: true, name: "company-birthday-wishes" });

async function sendBirthdayWishes() {
  try {
    const [recipients] = await db.query(
      `
      SELECT birthday_customer.user_id AS birthday_user_id,
             birthday_employee.name AS birthday_name,
             coworker_customer.user_id AS recipient_user_id,
             birthday_employee.company_id,
             DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS notification_day
      FROM company_users birthday_employee
      INNER JOIN customer birthday_customer
              ON birthday_customer.company_user_id = birthday_employee.id
             AND birthday_customer.status = 1
      INNER JOIN companies company
              ON company.company_id = birthday_employee.company_id
             AND company.status = 1
      INNER JOIN company_users coworker
              ON coworker.company_id = birthday_employee.company_id
             AND coworker.status = 1
             AND coworker.id <> birthday_employee.id
      INNER JOIN customer coworker_customer
              ON coworker_customer.company_user_id = coworker.id
             AND coworker_customer.status = 1
      WHERE birthday_employee.status = 1
        AND MONTH(birthday_employee.dob) = MONTH(CURDATE())
        AND DAY(birthday_employee.dob) = DAY(CURDATE())
      `
    );

    if (recipients.length === 0) {
      console.log("[Cron] No coworker birthday notifications to send today.");
      return;
    }

    console.log(`[Cron] Found ${recipients.length} coworker birthday notification(s).`);

    for (const recipient of recipients) {
      await notifyUserAndWait(
        {
          userId: recipient.recipient_user_id,
          module: "birthday",
          type: "coworker_birthday",
          title: `It's ${recipient.birthday_name}'s birthday! 🎉`,
          message: `Wish ${recipient.birthday_name} a happy birthday today!`,
          icon: "gift",
          reference_type: "coworker",
          reference_id: String(recipient.birthday_user_id),
          idempotency_key: `birthday:${recipient.company_id}:${recipient.birthday_user_id}:${recipient.recipient_user_id}:${recipient.notification_day}`,
          action_url: "/dashboard",
          screen: "Dashboard",
        },
        "coworker birthday notification",
      );
    }
  } catch (error) {
    console.error("[Cron] Error running birthday reminder job:", error);
  }
}

module.exports = { sendBirthdayWishes };
