const cron = require("node-cron");
const db = require("../../config/database");
const { notifyUserAndWait } = require("../../app/common/utils/notification");

const DEFAULT_DELIVERY_GAP_MS = 1000;
const SCHEDULE_TIMEZONE = process.env.SCHEDULE_TIMEZONE || "Asia/Kolkata";

function getDeliveryGapMs() {
  const configured = Number.parseInt(process.env.FITNESS_PUSH_GAP_MS, 10);
  return Number.isFinite(configured) && configured >= 100
    ? configured
    : DEFAULT_DELIVERY_GAP_MS;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function sendIndividually(users, buildPayload, label) {
  const gapMs = getDeliveryGapMs();

  for (let index = 0; index < users.length; index += 1) {
    const user = users[index];
    try {
      await notifyUserAndWait(buildPayload(user));
    } catch (error) {
      // One bad token/user must not stop reminders for everyone after them.
      console.error(`[Cron] ${label} failed for User ${user.user_id}:`, error.message);
    }

    if (index < users.length - 1) await wait(gapMs);
  }
}

// Mid-day goal hook: daily at 2:00 PM
cron.schedule("0 14 * * *", async () => {
  console.log("🚶‍♂️ [Cron] Checking daily mid-day step count hooks (2:00 PM)...");
  await checkMidDayGoalHook();
}, { timezone: SCHEDULE_TIMEZONE });

// Almost completed push: daily at 6:00 PM
cron.schedule("0 18 * * *", async () => {
  console.log("🏁 [Cron] Checking daily step count almost completed hooks (6:00 PM)...");
  await checkAlmostCompletedPush();
}, { timezone: SCHEDULE_TIMEZONE });

// 1. Mid-day Hook: steps < 30% of goal at 2:00 PM
async function checkMidDayGoalHook() {
  try {
    const [stats] = await db.query(
      `
      SELECT g.user_id, g.daily_steps, s.steps
      FROM fitness_goals g
      INNER JOIN customer c ON g.user_id = c.user_id
      INNER JOIN fitness_steps s ON g.user_id = s.user_id AND s.step_date = CURDATE()
      LEFT JOIN notifications n ON n.user_id = g.user_id
                               AND n.type = 'fitness_midday_hook'
                               AND n.created_at >= CURDATE()
      WHERE n.notification_id IS NULL
        AND s.steps > 0
        AND s.steps < (g.daily_steps * 0.3)
      `
    );

    await sendIndividually(stats, (user) => ({
        userId: user.user_id,
        module: "fitness",
        type: "fitness_midday_hook",
        title: "Let's get moving! 🚶‍♂️",
        message: `You've walked ${Number(user.steps).toLocaleString("en-IN")} steps today. Take a quick stroll to hit your daily goal!`,
        icon: "footprints",
        reference_type: "fitness_goal",
        reference_id: "midday_hook",
        action_url: "/fitness",
      }), "fitness mid-day hook");
  } catch (err) {
    console.error("[Cron] Mid-day goal hook failed:", err.message);
  }
}

// 2. Almost Completed: steps >= 80% and < 100% of goal at 6:00 PM
async function checkAlmostCompletedPush() {
  try {
    const [stats] = await db.query(
      `
      SELECT g.user_id, g.daily_steps, COALESCE(s.steps, 0) AS steps
      FROM fitness_goals g
      INNER JOIN customer c ON g.user_id = c.user_id
      LEFT JOIN fitness_steps s ON g.user_id = s.user_id AND s.step_date = CURDATE()
      LEFT JOIN notifications n ON n.user_id = g.user_id
                               AND n.type = 'fitness_almost_completed'
                               AND n.created_at >= CURDATE()
      WHERE n.notification_id IS NULL
        AND COALESCE(s.steps, 0) >= (g.daily_steps * 0.8)
        AND COALESCE(s.steps, 0) < g.daily_steps
      `
    );

    await sendIndividually(stats, (user) => {
      const remaining = user.daily_steps - user.steps;
      return {
        userId: user.user_id,
        module: "fitness",
        type: "fitness_almost_completed",
        title: "Almost there! 🏁",
        message: `Only ${Number(remaining).toLocaleString("en-IN")} steps left to achieve your daily target. You can do it!`,
        icon: "award",
        reference_type: "fitness_goal",
        reference_id: "almost_completed",
        action_url: "/fitness",
      };
    }, "fitness almost completed push");
  } catch (err) {
    console.error("[Cron] Almost completed push failed:", err.message);
  }
}

module.exports = { checkMidDayGoalHook, checkAlmostCompletedPush };
