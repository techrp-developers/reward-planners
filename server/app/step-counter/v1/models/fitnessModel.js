const db = require("../../../../config/database");

class FitnessModel {
  async upsertSteps(data, conn = db) {
    const {
      customer_id,
      step_date,
      steps,
      distance_km,
      calories,
      active_minutes,
    } = data;

    const query = `
      INSERT INTO fitness_steps
      (user_id, step_date, steps, distance_km, calories, active_minutes)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        steps = GREATEST(steps, VALUES(steps)),
        distance_km = VALUES(distance_km),
        calories = VALUES(calories),
        active_minutes = VALUES(active_minutes)
    `;

    await conn.execute(query, [
      customer_id,
      step_date,
      steps,
      distance_km,
      calories,
      active_minutes,
    ]);
  }

  // Locks the row for the duration of the caller's transaction so concurrent
  // syncs for the same user/date can't race on the same step-delta read.
  async getStepsByDateForUpdate(customerId, date, conn) {
    const [rows] = await conn.execute(
      `SELECT steps, distance_km, calories, active_minutes
       FROM fitness_steps
       WHERE user_id = ? AND step_date = ?
       FOR UPDATE`,
      [customerId, date],
    );

    return rows[0];
  }

  // Locks the streak row for the duration of the caller's transaction so
  // concurrent syncs for the same user can't both read-then-increment it.
  async getStreakForUpdate(customerId, conn) {
    const [rows] = await conn.execute(
      `SELECT current_streak, longest_streak, last_goal_completed_date
       FROM fitness_streaks
       WHERE user_id = ?
       FOR UPDATE`,
      [customerId],
    );

    return rows[0];
  }

  async getTodaySteps(customerId, date) {
    const [rows] = await db.execute(
      `SELECT * FROM fitness_steps WHERE user_id = ? AND step_date = ?`,
      [customerId, date],
    );
    return rows[0];
  }

  async getGoal(customerId) {
    const [rows] = await db.execute(
      `SELECT * FROM fitness_goals WHERE user_id = ? ORDER BY goal_id DESC LIMIT 1`,
      [customerId],
    );
    return rows[0];
  }

  async getStreak(customerId) {
    const [rows] = await db.execute(
      `SELECT * FROM fitness_streaks WHERE user_id = ?`,
      [customerId],
    );
    return rows[0];
  }

  async upsertStreak(customerId, currentStreak, longestStreak, lastDate) {
    await db.execute(
      `INSERT INTO fitness_streaks (user_id, current_streak, longest_streak, last_goal_completed_date)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       current_streak = ?,
       longest_streak = ?,
       last_goal_completed_date = ?`,
      [
        customerId,
        currentStreak,
        longestStreak,
        lastDate,
        currentStreak,
        longestStreak,
        lastDate,
      ],
    );
  }

  async getUserAchievements(customerId, conn = db) {
    const [rows] = await conn.execute(
      `SELECT achievement_id FROM fitness_user_achievements WHERE user_id = ?`,
      [customerId],
    );
    return rows.map((r) => Number(r.achievement_id));
  }

  async unlockAchievement(customerId, achievementId, conn) {
    await conn.execute(
      `INSERT IGNORE INTO fitness_user_achievements (user_id, achievement_id)
     VALUES (?, ?)`,
      [customerId, achievementId],
    );
  }

  async getAllAchievements(conn = db) {
    const [rows] = await conn.execute(`SELECT * FROM fitness_achievements`);
    return rows;
  }

  async addWalletTransaction(customerId, coins, activity) {
    const EXPIRY_MONTHS = parseInt(process.env.WALLET_EXPIRY_MONTHS || "3", 10);

    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + EXPIRY_MONTHS);

    await db.execute(
      `
        INSERT INTO wallet_transactions
        (
          user_id,
          title,
          description,
          transaction_type,
          coins,
          balance_after,
          category,
          expiry_date,
          reason_code
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      [
        customerId,
        "Coins Credited",
        "Fitness Goal Reward",
        "credit",
        coins,
        null,
        "steps",
        expiryDate,
        "ORDER_REWARD",
      ],
    );

    await db.execute(
      `INSERT INTO customer_wallet (user_id, balance)
      VALUES (?, 0)
      ON DUPLICATE KEY UPDATE user_id = user_id`,
      [customerId],
    );

    await db.execute(
      `UPDATE customer_wallet
       SET balance = balance + ?
       WHERE user_id = ?`,
      [coins, customerId],
    );
  }

  async hasReward(customerId, date, type, referenceId = null, conn) {
    if (!conn) {
      throw new Error("Transaction connection required");
    }
    const [rows] = await conn.execute(
      `SELECT id FROM fitness_rewards_log
     WHERE user_id = ?
     AND reward_date = ?
     AND reward_type = ?
     AND (reference_id <=> ?)`,
      [customerId, date, type, referenceId],
    );

    return rows.length > 0;
  }

  async insertRewardLog(customerId, date, type, referenceId, coins, conn) {
    const query = `
    INSERT INTO fitness_rewards_log
    (user_id, reward_date, reward_type, reference_id, coins)
    VALUES (?, ?, ?, ?, ?)
  `;

    await conn.execute(query, [customerId, date, type, referenceId, coins]);
  }

  async getStepsByDate(customerId, date) {
    const [rows] = await db.execute(
      `SELECT steps, distance_km, calories, active_minutes
     FROM fitness_steps
     WHERE user_id = ? AND step_date = ?`,
      [customerId, date],
    );

    return rows[0];
  }

  async getLifetimeSteps(customerId, conn = db) {
    const [rows] = await conn.execute(
      `
      SELECT COALESCE(SUM(steps), 0) AS total_steps
      FROM fitness_steps
      WHERE user_id = ?
    `,
      [customerId],
    );

    return Number(rows[0]?.total_steps || 0);
  }
}

module.exports = new FitnessModel();
