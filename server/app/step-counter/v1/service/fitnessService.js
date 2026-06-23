const FitnessModel = require("../models/fitnessModel");
const db = require("../../../../config/database");
const { notifyUser } = require("../../../common/utils/notification");

const formatDate = (date) => {
  return new Date(date).toLocaleDateString("en-CA"); // YYYY-MM-DD
};

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const assertNumberInRange = (value, label, min, max) => {
  const number = toFiniteNumber(value);
  if (number === null || number < min || number > max) {
    throw new Error(`Invalid ${label}`);
  }
  return number;
};

class FitnessService {
  async syncSteps(customerId, payload) {
    const {
      steps: rawSteps,
      distance_km: rawDistance,
      calories: rawCalories,
      active_minutes: rawActiveMinutes,
      date,
    } = payload || {};

    // Allow today, yesterday, or tomorrow (server-local) — any two real-world
    // timezones can differ by at most one calendar day, so this tolerates
    // device/server timezone mismatch instead of rejecting legitimate syncs
    // made near midnight.
    const now = new Date();
    const serverYesterday = new Date(now);
    serverYesterday.setDate(now.getDate() - 1);
    const serverTomorrow = new Date(now);
    serverTomorrow.setDate(now.getDate() + 1);

    const allowedDates = [serverYesterday, now, serverTomorrow].map(formatDate);
    if (!date || !allowedDates.includes(date)) {
      throw new Error("Only today's steps can be synced");
    }

    const steps = assertNumberInRange(rawSteps, "step count", 0, 40000);
    const distance_km = assertNumberInRange(rawDistance ?? 0, "distance", 0, 100);
    const calories = assertNumberInRange(rawCalories ?? 0, "calories", 0, 10000);
    const active_minutes = assertNumberInRange(
      rawActiveMinutes ?? 0,
      "active minutes",
      0,
      1440,
    );

    // -------------------------------
    // Anti cheat
    // -------------------------------
    if (steps > 5000 && active_minutes < 5) {
      throw new Error("Invalid activity pattern");
    }

    // -------------------------------
    // 1. Get goal (read-only, no concurrency concern)
    // -------------------------------
    const goal = await FitnessModel.getGoal(customerId);

    if (!goal) {
      return { message: "No goal set" };
    }

    const [profileRows] = await db.execute(
      `
      SELECT goal_type
      FROM fitness_profiles
      WHERE user_id = ?
    `,
      [customerId],
    );

    const profile = profileRows[0];

    // -------------------------------
    // 2. TRANSACTION START — step save, streak update, and reward/wallet
    //    writes all happen atomically so a failure can't leave steps saved
    //    without their matching streak/coin credit (or vice versa). The
    //    FOR UPDATE locks also serialize concurrent syncs for the same user
    //    so two near-simultaneous requests can't both read a stale streak
    //    and double-increment or double-reward.
    // -------------------------------
    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
      // -------------------------------
      // STEP DELTA VALIDATION (locked read)
      // -------------------------------
      const streakData = await FitnessModel.getStreakForUpdate(customerId, conn);
      const existingSteps = await FitnessModel.getStepsByDateForUpdate(customerId, date, conn);
      const previousSteps = existingSteps?.steps || 0;
      const stepDiff = steps - previousSteps;

      if (existingSteps) {
        //  Case 1: Same or lower steps → ignore
        if (steps <= previousSteps) {
          await conn.commit();
          return {
            message: "No new steps to process",
            goalAchieved: Math.max(previousSteps, steps) >= goal.daily_steps,
            reward: 0,
            currentStreak: streakData?.current_streak || 0,
          };
        }

        //  Case 2: Unrealistic jump (anti-cheat)
        if (stepDiff > 20000) {
          throw new Error("Suspicious step increase detected");
        }

        if (stepDiff > 5000 && active_minutes < 5) {
          throw new Error("Invalid activity pattern");
        }
      } else if (steps > 20000) {
        throw new Error("Suspicious step increase detected");
      }

      // -------------------------------
      // SAVE STEPS (ALWAYS if valid, inside the same transaction)
      // -------------------------------
      await FitnessModel.upsertSteps(
        {
          customer_id: customerId,
          step_date: date,
          steps,
          distance_km,
          calories,
          active_minutes,
        },
        conn,
      );

      // -------------------------------
      // CHECK GOAL (AFTER SAVE)
      // -------------------------------
      let goalAchieved = false;

      if (steps >= goal.daily_steps) {
        goalAchieved = true;
      } else {
        await conn.commit();
        return {
          message: "Steps synced",
          goalAchieved: false,
          reward: 0,
        };
      }

      // -------------------------------
      // STREAK LOGIC
      // -------------------------------
      let currentStreak = 1;
      let longestStreak = 1;

      const syncDate = new Date(date);
      const yesterday = new Date(syncDate);
      yesterday.setDate(syncDate.getDate() - 1);

      if (streakData) {
        const lastDate = new Date(streakData.last_goal_completed_date);

        const lastDateStr = formatDate(lastDate);
        const todayStr = formatDate(syncDate);
        const yesterdayStr = formatDate(yesterday);

        if (lastDateStr === yesterdayStr) {
          currentStreak = streakData.current_streak + 1;
        } else if (lastDateStr === todayStr) {
          // already processed today → don't increase
          currentStreak = streakData.current_streak;
        } else {
          currentStreak = 1;
        }

        longestStreak = Math.max(streakData.longest_streak, currentStreak);
      }

      let totalReward = 0;
      let unlockedAchievements = [];

      // -------------------------------
      // Update streak INSIDE TX
      // -------------------------------
      await conn.execute(
        `INSERT INTO fitness_streaks
       (user_id, current_streak, longest_streak, last_goal_completed_date)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         current_streak = ?,
         longest_streak = ?,
         last_goal_completed_date = ?`,
        [
          customerId,
          currentStreak,
          longestStreak,
          date,
          currentStreak,
          longestStreak,
          date,
        ],
      );

      // -------------------------------
      // GOAL REWARD (once per day)
      // -------------------------------
      const alreadyGoalRewarded = await FitnessModel.hasReward(
        customerId,
        date,
        "goal",
        null,
        conn,
      );

      let showGoalPopup = false;
      if (!alreadyGoalRewarded) {
        showGoalPopup = true;

        const goalCoins = 50;

        try {
          await FitnessModel.insertRewardLog(
            customerId,
            date,
            "goal",
            null,
            goalCoins,
            conn,
          );

          totalReward += goalCoins;
        } catch (err) {
          if (err.code !== "ER_DUP_ENTRY") throw err;
        }
      }

      // -------------------------------
      // STREAK BONUS
      // -------------------------------
      if (currentStreak === 7 || currentStreak === 14) {
        const alreadyStreakRewarded = await FitnessModel.hasReward(
          customerId,
          date,
          "streak",
          currentStreak,
          conn,
        );

        if (!alreadyStreakRewarded) {
          const streakCoins = currentStreak === 7 ? 100 : 200;

          await FitnessModel.insertRewardLog(
            customerId,
            date,
            "streak",
            currentStreak,
            streakCoins,
            conn,
          );

          totalReward += streakCoins;
        }
      }

      // -------------------------------
      // ACHIEVEMENTS
      // -------------------------------
      // Total lifetime steps
      const totalSteps = await FitnessModel.getLifetimeSteps(customerId, conn);

      const allAchievements = await FitnessModel.getAllAchievements(conn);

      const userAchievements =
        await FitnessModel.getUserAchievements(customerId, conn);

      for (const achievement of allAchievements) {
        // already unlocked
        if (userAchievements.includes(Number(achievement.achievement_id))) {
          continue;
        }

        let unlock = false;

        // -------------------------------
        // Lifetime walking achievements
        // -------------------------------
        if (
          achievement.type === "steps" &&
          totalSteps >= achievement.target_value
        ) {
          unlock = true;
        }

        // -------------------------------
        // Streak achievements
        // -------------------------------
        if (
          achievement.type === "streak" &&
          currentStreak >= achievement.target_value
        ) {
          unlock = true;
        }

        // -------------------------------
        // Unlock achievement
        // -------------------------------
        if (unlock) {
          const alreadyGiven = await FitnessModel.hasReward(
            customerId,
            date,
            "achievement",
            achievement.achievement_id,
            conn,
          );

          if (!alreadyGiven) {
            await FitnessModel.unlockAchievement(
              customerId,
              achievement.achievement_id,
              conn,
            );

            await FitnessModel.insertRewardLog(
              customerId,
              date,
              "achievement",
              achievement.achievement_id,
              achievement.reward_coins,
              conn,
            );

            totalReward += achievement.reward_coins || 0;

            unlockedAchievements.push({
              id: achievement.achievement_id,
              title: achievement.title,
              reward_coins: achievement.reward_coins,
              type: achievement.type,
              description: achievement.description,
            });
          }
        }
      }

      // -------------------------------
      // WALLET UPDATE
      // -------------------------------
      if (totalReward > 0) {
        await conn.execute(
          `INSERT INTO customer_wallet (user_id, balance)
            VALUES (?, 0)
            ON DUPLICATE KEY UPDATE user_id = user_id`,
          [customerId],
        );

        await conn.execute(
          `UPDATE customer_wallet
         SET balance = balance + ?
         WHERE user_id = ?`,
          [totalReward, customerId],
        );

        const EXPIRY_MONTHS = parseInt(
          process.env.WALLET_EXPIRY_MONTHS || "3",
          10,
        );

        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + EXPIRY_MONTHS);

        await conn.execute(
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
            totalReward,
            null,
            "steps",
            expiryDate,
            "ORDER_REWARD",
          ],
        );
      }

      // -------------------------------
      // COMMIT
      // -------------------------------
      await conn.commit();

      if (totalReward > 0) {
        notifyUser(
          {
            userId: customerId,
            module: "fitness",
            type: "fitness_reward_earned",
            title: "Fitness reward earned",
            message: `You earned ${totalReward} coins from your fitness progress.`,
            icon: "footprints",
            reference_type: "fitness_reward",
            reference_id: date,
            action_url: "/fitness/wallet",
            metadata: {
              coins: totalReward,
              goal_achieved: goalAchieved,
              achievements: unlockedAchievements.map((item) => item.id),
            },
          },
          "fitness reward notification",
        );
      }

      for (const achievement of unlockedAchievements) {
        notifyUser(
          {
            userId: customerId,
            module: "fitness",
            type: "fitness_achievement_unlocked",
            title: "Achievement unlocked",
            message: `You unlocked ${achievement.title}.`,
            icon: "trophy",
            reference_type: "fitness_achievement",
            reference_id: achievement.id,
            action_url: "/fitness/achievements",
            metadata: {
              reward_coins: achievement.reward_coins,
              achievement_type: achievement.type,
            },
          },
          "fitness achievement notification",
        );
      }

      const goalMap = {
        weight_loss: "Weight Loss",
        weight_gain: "Weight Gain",
        stay_healthy: "Stay Healthy",
      };

      const goalLabel = goalMap[profile?.goal_type] || "Stay Healthy";

      return {
        message: "Steps synced",
        goalAchieved,
        reward: totalReward,
        currentStreak,
        unlockedAchievements,
        showGoalPopup,
        planOverview: {
          plan_type: goalLabel,
          total_duration_days: 30,
          current_day: currentStreak,
          daily_target: goal.daily_steps,
        },

        overallSummary: {
          steps,
          calories,
          distance_km,
          active_minutes,
        },
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // Dashboard
  async getDashboard(customerId) {
    const today = formatDate(new Date());

    const steps = await FitnessModel.getTodaySteps(customerId, today);
    const goal = await FitnessModel.getGoal(customerId);

    return {
      today_steps: steps?.steps || 0,
      goal_steps: goal?.daily_steps || 0,
    };
  }

  // select goal
  async selectGoal(customerId, daily_steps) {
    const dailySteps = assertNumberInRange(daily_steps, "daily steps", 1000, 40000);

    await db.execute(
      `INSERT INTO fitness_goals (user_id, daily_steps, start_date)
       VALUES (?, ?, CURDATE())`,
      [customerId, dailySteps],
    );

    await db.execute(
      `UPDATE customer SET fitness_onboarding_done = 1 WHERE user_id = ?`,
      [customerId],
    );

    notifyUser(
      {
        userId: customerId,
        module: "fitness",
        type: "fitness_goal_set",
        title: "Fitness goal set",
        message: `Your daily goal is set to ${dailySteps} steps.`,
        icon: "target",
        reference_type: "fitness_goal",
        reference_id: customerId,
        action_url: "/fitness",
        metadata: { daily_steps: dailySteps },
      },
      "fitness goal notification",
    );
  }

  // basic profiles
  async saveBasicProfile(customerId, gender, age, goal_type) {
    const validGenders = ["male", "female", "other"];
    const validGoals = ["weight_loss", "weight_gain", "stay_healthy"];
    const normalizedGender = String(gender || "").trim().toLowerCase();
    const normalizedGoalType = String(goal_type || "").trim();
    const profileAge = assertNumberInRange(age, "age", 13, 120);

    if (!validGenders.includes(normalizedGender)) {
      throw new Error("Invalid gender");
    }

    if (!validGoals.includes(normalizedGoalType)) {
      throw new Error("Invalid goal type");
    }

    await db.execute(
      `INSERT INTO fitness_profiles (user_id, gender, age, goal_type)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE gender=?, age=?, goal_type=?`,
      [
        customerId,
        normalizedGender,
        profileAge,
        normalizedGoalType,
        normalizedGender,
        profileAge,
        normalizedGoalType,
      ],
    );
  }

  // set profile
  async saveBodyProfile(customerId, height, weight) {
    const heightCm = assertNumberInRange(height, "height", 80, 250);
    const weightKg = assertNumberInRange(weight, "weight", 20, 300);
    const bmi = weightKg / ((heightCm / 100) * (heightCm / 100));

    await db.execute(
      `UPDATE fitness_profiles
       SET height_cm=?, weight_kg=?, bmi=?
       WHERE user_id=?`,
      [heightCm, weightKg, bmi, customerId],
    );
  }

  /* ------------------------------------------
     WALLET HISTORY
  ------------------------------------------ */
  async getWalletHistory(customerId) {
    const [rows] = await db.execute(
      `
    SELECT 
      transaction_id,
      title,
      description,
      transaction_type,
      coins,
      balance_after,
      category,
      expiry_date,
      created_at
    FROM wallet_transactions
    WHERE user_id = ?
    AND category = 'steps'
    ORDER BY created_at DESC
    `,
      [customerId],
    );

    return rows.map((row) => ({
      id: row.transaction_id,
      title: row.title,
      description: row.description,
      type: row.transaction_type,
      coins: row.coins,
      balance_after: row.balance_after,
      category: row.category,
      expiry_date: row.expiry_date,
      date: new Date(row.created_at).toLocaleDateString("en-CA"),
    }));
  }

  async getWalletSummary(customerId) {
    // -------------------------------
    // Wallet balance (steps only)
    // -------------------------------
    const [balanceRows] = await db.execute(
      `
    SELECT 
      COALESCE(
        SUM(
          CASE 
            WHEN transaction_type = 'credit' THEN coins
            WHEN transaction_type = 'debit' THEN -coins
            ELSE 0
          END
        ),
      0) AS balance
    FROM wallet_transactions
    WHERE user_id = ?
    AND category = 'steps'
    `,
      [customerId],
    );

    const balance = balanceRows[0]?.balance || 0;

    // -------------------------------
    // Expiring coins (steps only)
    // -------------------------------
    const [expiryRows] = await db.execute(
      `
    SELECT 
      COALESCE(SUM(coins), 0) AS expiring_coins,
      MIN(expiry_date) AS nearest_expiry
    FROM wallet_transactions
    WHERE user_id = ?
    AND category = 'steps'
    AND transaction_type = 'credit'
    AND expiry_date IS NOT NULL
    AND expiry_date > NOW()
    `,
      [customerId],
    );

    return {
      balance,
      expiring_coins: expiryRows[0]?.expiring_coins || 0,
      expiry_date: expiryRows[0]?.nearest_expiry || null,
    };
  }

  /* ------------------------------------------
     PLAN (BMI + recommendation)
  ------------------------------------------ */
  async getPlan(customerId) {
    const [rows] = await db.execute(
      `SELECT height_cm, weight_kg, bmi, goal_type
       FROM fitness_profiles
       WHERE user_id = ?`,
      [customerId],
    );

    const profile = rows[0];

    if (!profile) {
      throw new Error("Profile not found");
    }

    let category = "";
    let recommended_steps = 6000;
    let recommended_minutes = 45;

    const bmi = profile.bmi;
    const goal = profile.goal_type;
    const goalMap = {
      weight_loss: "Weight Loss",
      weight_gain: "Weight Gain",
      stay_healthy: "Stay Healthy",
    };

    const goalLabel = goalMap[goal] || "Stay Healthy";

    if (bmi < 18.5) {
      category = "underweight";
      recommended_steps = 5000;
    } else if (bmi < 25) {
      category = "normal";
      recommended_steps = 7000;
    } else if (bmi < 30) {
      category = "overweight";
      recommended_steps = 8000;
    } else {
      category = "obese";
      recommended_steps = 9000;
    }

    return {
      bmi,
      category,
      recommended_steps,
      recommended_minutes,
      goal: goalLabel,
      weekly_plan: [
        { week: 1, steps: 5000 },
        { week: 2, steps: 6000 },
        { week: 3, steps: 7000 },
        { week: 4, steps: recommended_steps },
      ],
    };
  }

  /* ------------------------------------------
     ACHIEVEMENTS
  ------------------------------------------ */
  async getAchievements(customerId) {
    const [rows] = await db.execute(
      `
    SELECT 
      a.achievement_id,
      a.title,
      a.description,
      a.target_value,
      a.type,
      a.reward_coins,
      a.icon,
      a.group_id,

      g.group_key,
      g.title AS group_title,
      g.description AS group_description,
      g.icon AS group_icon,
      g.display_order,

      IF(ua.achievement_id IS NOT NULL, 1, 0) AS achieved

    FROM fitness_achievements a

    LEFT JOIN fitness_achievement_groups g
      ON a.group_id = g.group_id

    LEFT JOIN fitness_user_achievements ua
      ON a.achievement_id = ua.achievement_id
      AND ua.user_id = ?

    ORDER BY g.display_order ASC, a.target_value ASC
    `,
      [customerId],
    );

    // -------------------------------
    // Group achievements
    // -------------------------------
    const grouped = {};

    rows.forEach((row) => {
      if (!grouped[row.group_id]) {
        grouped[row.group_id] = {
          group_id: row.group_id,
          group_key: row.group_key,
          title: row.group_title,
          description: row.group_description,
          icon: row.group_icon,
          milestones: [],
        };
      }

      grouped[row.group_id].milestones.push({
        achievement_id: row.achievement_id,
        title: row.title,
        description: row.description,
        target_value: row.target_value,
        reward_coins: row.reward_coins,
        type: row.type,
        icon: row.icon,
        achieved: !!row.achieved,
      });
    });

    return Object.values(grouped);
  }

  async getCalendar(customerId, month) {
    // -------------------------------
    // Get DB data
    // -------------------------------
    const [rows] = await db.execute(
      `
    SELECT step_date, steps, distance_km, calories, active_minutes
    FROM fitness_steps
    WHERE user_id = ?
    AND DATE_FORMAT(step_date, '%Y-%m') = ?
    `,
      [customerId, month],
    );

    const goal = await FitnessModel.getGoal(customerId);

    // -------------------------------
    // Map DB data
    // -------------------------------
    const dataMap = {};

    rows.forEach((row) => {
      const dateStr = new Date(row.step_date).toLocaleDateString("en-CA");

      dataMap[dateStr] = {
        steps: row.steps,
        distance_km: Number(row.distance_km),
        calories: Number(row.calories),
        active_minutes: row.active_minutes,
      };
    });

    // -------------------------------
    // Month calculations
    // -------------------------------
    const [year, mon] = month.split("-");
    const daysInMonth = new Date(year, mon, 0).getDate();

    const calendar = {};

    // -------------------------------
    // Summary counters
    // -------------------------------
    let completedDays = 0;
    let missedDays = 0;

    let totalSteps = 0;
    let totalCalories = 0;
    let totalDistance = 0;
    let totalMinutes = 0;

    // -------------------------------
    // Build calendar
    // -------------------------------
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, mon - 1, day);
      const dateStr = d.toLocaleDateString("en-CA");

      const dayData = dataMap[dateStr] || {
        steps: 0,
        distance_km: 0,
        calories: 0,
        active_minutes: 0,
      };

      const isCompleted = goal && dayData.steps >= goal.daily_steps;

      // count days
      if (isCompleted) {
        completedDays++;
      } else {
        missedDays++;
      }

      // totals
      totalSteps += dayData.steps;
      totalCalories += dayData.calories;
      totalDistance += dayData.distance_km;
      totalMinutes += dayData.active_minutes;

      // calendar entry
      calendar[dateStr] = {
        status: isCompleted ? "completed" : "missed",
        steps: dayData.steps,
        goal_steps: goal?.daily_steps || 0,
        distance_km: dayData.distance_km,
        calories: dayData.calories,
        active_minutes: dayData.active_minutes,
        progress_percent: goal
          ? Math.min((dayData.steps / goal.daily_steps) * 100, 100)
          : 0,
      };
    }

    // -------------------------------
    // Month label (for UI)
    // -------------------------------
    const monthName = new Date(year, mon - 1).toLocaleString("default", {
      month: "long",
    });

    // -------------------------------
    // Final response
    // -------------------------------
    return {
      month,
      month_label: `${monthName} ${year}`,

      summary: {
        completed_days: completedDays,
        missed_days: missedDays,
        total_steps: totalSteps,
        total_calories: Number(totalCalories.toFixed(2)),
        total_distance_km: Number(totalDistance.toFixed(2)),
        total_active_minutes: totalMinutes,
      },

      calendar,
    };
  }

  /* ------------------------------------------
     STATS (Graph Data)
  ------------------------------------------ */
  async getStats(customerId, range) {
    let days = range === "30days" ? 30 : 7;

    const [rows] = await db.execute(
      `
    SELECT 
      step_date,
      steps,
      distance_km,
      calories
    FROM fitness_steps
    WHERE user_id = ?
    AND step_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `,
      [customerId, days],
    );

    // -------------------------------
    // Convert DB rows → map
    // -------------------------------
    const dataMap = {};

    rows.forEach((row) => {
      const dateStr = new Date(row.step_date).toLocaleDateString("en-CA");

      dataMap[dateStr] = {
        steps: row.steps,
        distance_km: row.distance_km,
        calories: row.calories,
      };
    });

    // -------------------------------
    // Fill missing dates
    // -------------------------------
    const result = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);

      const dateStr = d.toLocaleDateString("en-CA");

      result.push({
        date: dateStr,
        steps: dataMap[dateStr]?.steps || 0,
        distance_km: dataMap[dateStr]?.distance_km || 0,
        calories: dataMap[dateStr]?.calories || 0,
      });
    }

    return result;
  }

  // Get todays summary (for dashboard)
  async getTodaySummary(customerId) {
    const today = formatDate(new Date());

    const stepsData = await FitnessModel.getStepsByDate(customerId, today);
    const goal = await FitnessModel.getGoal(customerId);

    const steps = stepsData?.steps || 0;
    const activeMinutes = stepsData?.active_minutes || 0;

    return {
      steps,
      goal_steps: goal?.daily_steps || 0,
      progress_percent: goal
        ? Math.min((steps / goal.daily_steps) * 100, 100)
        : 0,
      distance_km: stepsData?.distance_km || 0,
      calories: stepsData?.calories || 0,
      active_minutes: activeMinutes,
    };
  }

  // Weekly progress
  async getWeeklyProgress(customerId) {
    const formatDate = (date) => new Date(date).toLocaleDateString("en-CA"); // YYYY-MM-DD

    const days = 7;

    const [rows] = await db.execute(
      `
    SELECT step_date, steps
    FROM fitness_steps
    WHERE user_id = ?
    AND step_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `,
      [customerId, days],
    );

    // -------------------------------
    // Convert DB rows → map
    // -------------------------------
    const dataMap = {};

    rows.forEach((row) => {
      const dateStr = formatDate(row.step_date);
      dataMap[dateStr] = row.steps;
    });

    // -------------------------------
    // Fill missing days
    // -------------------------------
    const result = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);

      const dateStr = formatDate(d);

      result.push({
        date: dateStr,
        steps: dataMap[dateStr] || 0,
      });
    }

    return result;
  }

  async getStreak(customerId) {
    const [rows] = await db.execute(
      `SELECT current_streak, longest_streak
     FROM fitness_streaks
     WHERE user_id = ?`,
      [customerId],
    );

    return (
      rows[0] || {
        current_streak: 0,
        longest_streak: 0,
      }
    );
  }

  async getGoal(customerId) {
    const [rows] = await db.execute(
      `SELECT daily_steps, daily_active_minutes
     FROM fitness_goals
     WHERE user_id = ?
     ORDER BY goal_id DESC
     LIMIT 1`,
      [customerId],
    );

    return rows[0] || null;
  }

  async getOnboardingStatus(customerId) {
    const [rows] = await db.execute(
      `SELECT fitness_onboarding_done 
     FROM customer 
     WHERE user_id = ?`,
      [customerId],
    );

    return rows[0]?.fitness_onboarding_done === 1;
  }

  async getTodayHourlyStats(customerId) {
    const today = new Date().toLocaleDateString("en-CA");

    const [rows] = await db.execute(
      `
    SELECT steps
    FROM fitness_steps
    WHERE user_id = ?
    AND step_date = ?
    `,
      [customerId, today],
    );

    const totalSteps = rows[0]?.steps || 0;

    // Simulated hourly distribution
    const hourlyData = [
      {
        time: "6AM",
        steps: Math.floor(totalSteps * 0.1),
      },
      {
        time: "9AM",
        steps: Math.floor(totalSteps * 0.15),
      },
      {
        time: "12PM",
        steps: Math.floor(totalSteps * 0.25),
      },
      {
        time: "3PM",
        steps: Math.floor(totalSteps * 0.2),
      },
      {
        time: "6PM",
        steps: Math.floor(totalSteps * 0.3),
      },
    ];

    return hourlyData;
  }
}

module.exports = new FitnessService();
