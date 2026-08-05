const cron = require("node-cron");
const db = require("../../config/database");
const { notifyUser } = require("../../app/common/utils/notification");

// Mid-day goal hook: daily at 2:00 PM
cron.schedule("0 14 * * *", async () => {
  console.log("🚶‍♂️ [Cron] Checking daily mid-day step count hooks (2:00 PM)...");
  await checkMidDayGoalHook();
});

// Almost completed push: daily at 6:00 PM
cron.schedule("0 18 * * *", async () => {
  console.log("🏁 [Cron] Checking daily step count almost completed hooks (6:00 PM)...");
  await checkAlmostCompletedPush();
});

// 1. Mid-day Hook: steps < 30% of goal at 2:00 PM
async function checkMidDayGoalHook() {
  try {
    const [stats] = await db.query(
      `
      SELECT g.user_id, g.daily_steps, COALESCE(s.steps, 0) AS steps, c.fcm_token
      FROM fitness_goals g
      INNER JOIN customer c ON g.user_id = c.user_id
      LEFT JOIN fitness_steps s ON g.user_id = s.user_id AND s.step_date = CURDATE()
      LEFT JOIN notifications n ON n.user_id = g.user_id
                               AND n.type = 'fitness_midday_hook'
                               AND n.created_at >= CURDATE()
      WHERE c.fcm_token IS NOT NULL
        AND c.fcm_token != ''
        AND n.notification_id IS NULL
        AND COALESCE(s.steps, 0) < (g.daily_steps * 0.3)
      `
    );

    for (const user of stats) {
      notifyUser({
        userId: user.user_id,
        module: "fitness",
        type: "fitness_midday_hook",
        title: "Let's get moving! 🚶‍♂️",
        message: `You've walked ${user.steps} steps today. Take a quick stroll to hit your daily goal!`,
        icon: "footprints",
        reference_type: "fitness_goal",
        reference_id: "midday_hook",
        action_url: "/fitness",
      }, "fitness mid-day hook");
    }
  } catch (err) {
    console.error("[Cron] Mid-day goal hook failed:", err.message);
  }
}

// 2. Almost Completed: steps >= 80% and < 100% of goal at 6:00 PM
async function checkAlmostCompletedPush() {
  try {
    const [stats] = await db.query(
      `
      SELECT g.user_id, g.daily_steps, COALESCE(s.steps, 0) AS steps, c.fcm_token
      FROM fitness_goals g
      INNER JOIN customer c ON g.user_id = c.user_id
      LEFT JOIN fitness_steps s ON g.user_id = s.user_id AND s.step_date = CURDATE()
      LEFT JOIN notifications n ON n.user_id = g.user_id
                               AND n.type = 'fitness_almost_completed'
                               AND n.created_at >= CURDATE()
      WHERE c.fcm_token IS NOT NULL
        AND c.fcm_token != ''
        AND n.notification_id IS NULL
        AND COALESCE(s.steps, 0) >= (g.daily_steps * 0.8)
        AND COALESCE(s.steps, 0) < g.daily_steps
      `
    );

    for (const user of stats) {
      const remaining = user.daily_steps - user.steps;
      notifyUser({
        userId: user.user_id,
        module: "fitness",
        type: "fitness_almost_completed",
        title: "Almost there! 🏁",
        message: `Only ${remaining} steps left to achieve your daily target. You can do it!`,
        icon: "award",
        reference_type: "fitness_goal",
        reference_id: "almost_completed",
        action_url: "/fitness",
      }, "fitness almost completed push");
    }
  } catch (err) {
    console.error("[Cron] Almost completed push failed:", err.message);
  }
}

module.exports = { checkMidDayGoalHook, checkAlmostCompletedPush };
