// app/games/v1/controller/quizController.js
const db = require("../../../../config/database");

// Helper to get time until next midnight
const getCountdownMs = () => {
  const next = new Date();
  next.setHours(24, 0, 0, 0);
  return Math.max(next.getTime() - Date.now(), 0);
};

// Helper to get yesterday date string
const getYesterdayDateString = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

// Helper to get today date string
const getTodayDateString = () => {
  return new Date().toISOString().slice(0, 10);
};

// Get the 5 daily questions for today based on the day of the year and company_id
const getTodayQuestions = async (companyId = null, connection = db) => {
  let questions = [];

  // 1. Fetch questions for the given company_id if not null
  if (companyId !== null) {
    const [companyQuestions] = await connection.execute(
      "SELECT * FROM quiz_questions WHERE active = 1 AND company_id = ? ORDER BY id ASC",
      [companyId]
    );
    questions = companyQuestions;
  }

  // 2. Fallback to global questions (company_id IS NULL)
  if (questions.length === 0) {
    const [globalQuestions] = await connection.execute(
      "SELECT * FROM quiz_questions WHERE active = 1 AND company_id IS NULL ORDER BY id ASC"
    );
    questions = globalQuestions;
  }

  // 3. Absolute fallback: any active questions
  if (questions.length === 0) {
    const [anyQuestions] = await connection.execute(
      "SELECT * FROM quiz_questions WHERE active = 1 ORDER BY id ASC"
    );
    questions = anyQuestions;
  }

  if (questions.length === 0) return [];

  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 1)) / 86400000);
  const startIdx = (dayOfYear * 5) % questions.length;
  
  const todayList = [];
  for (let i = 0; i < 5; i++) {
    const qIdx = (startIdx + i) % questions.length;
    todayList.push(questions[qIdx]);
  }
  return todayList;
};

exports.getDailyQuizState = async (req, res) => {
  try {
    const employeeId = req.query.employeeId || "1";
    const today = getTodayDateString();

    // 1. Fetch user/employee stats
    let employeeRow = null;
    const [employees] = await db.execute(
      "SELECT * FROM quiz_employee_stats WHERE user_id = ? OR username = ?",
      [employeeId, employeeId]
    );

    if (employees.length === 0) {
      // Auto register from eusers if exists
      const [eusers] = await db.execute(
        "SELECT user_id, name FROM eusers WHERE user_id = ? OR name = ?",
        [employeeId, employeeId]
      );

      if (eusers.length > 0) {
        const u = eusers[0];
        await db.execute(
          "INSERT INTO quiz_employee_stats (user_id, username, points, streak) VALUES (?, ?, 0, 0)",
          [u.user_id, u.name]
        );
        employeeRow = { user_id: u.user_id, username: u.name, points: 0, streak: 0, last_quiz_date: null };
      } else {
        // Create a fallback mock user
        const fallbackId = isNaN(employeeId) ? 999 : parseInt(employeeId);
        const fallbackName = isNaN(employeeId) ? employeeId : `Employee_${employeeId}`;
        await db.execute(
          "INSERT IGNORE INTO quiz_employee_stats (user_id, username, points, streak) VALUES (?, ?, 0, 0)",
          [fallbackId, fallbackName]
        );
        employeeRow = { user_id: fallbackId, username: fallbackName, points: 0, streak: 0, last_quiz_date: null };
      }
    } else {
      employeeRow = employees[0];
    }

    // Fetch user's company_id from customer table
    let companyId = null;
    const [customerRows] = await db.execute(
      "SELECT company_id FROM customer WHERE user_id = ?",
      [employeeRow.user_id]
    );
    if (customerRows.length > 0) {
      companyId = customerRows[0].company_id;
    }

    // 2. Fetch today's 5 active questions
    const todayQuestions = await getTodayQuestions(companyId);
    if (todayQuestions.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No active questions found in database."
      });
    }

    // 3. Fetch user submissions for today's questions
    const questionIds = todayQuestions.map(q => q.id);
    const [submissions] = await db.execute(
      `SELECT * FROM quiz_submissions 
       WHERE user_id = ? AND submitted_date = ? AND question_id IN (${questionIds.join(',')})
       ORDER BY created_at ASC`,
      [employeeRow.user_id, today]
    );

    // Standardize client response format
    const formattedQuestions = todayQuestions.map(q => ({
      id: q.id.toString(),
      domain: q.domain,
      rewardPoints: q.points,
      question: q.question,
      options: [q.option_a, q.option_b, q.option_c, q.option_d],
      correctIndex: q.correct_index,
      explanation: q.explanation,
      translations: {
        en: {
          question: q.question,
          options: [q.option_a, q.option_b, q.option_c, q.option_d],
          explanation: q.explanation
        },
        hi: {
          question: q.question_hi || q.question,
          options: [
            q.option_a_hi || q.option_a,
            q.option_b_hi || q.option_b,
            q.option_c_hi || q.option_c,
            q.option_d_hi || q.option_d
          ],
          explanation: q.explanation_hi || q.explanation
        },
        mr: {
          question: q.question_mr || q.question,
          options: [
            q.option_a_mr || q.option_a,
            q.option_b_mr || q.option_b,
            q.option_c_mr || q.option_c,
            q.option_d_mr || q.option_d
          ],
          explanation: q.explanation_mr || q.explanation
        }
      }
    }));

    // Map submissions sequentially to questions
    const formattedSubmissions = formattedQuestions.map(q => {
      const sub = submissions.find(s => s.question_id.toString() === q.id);
      return sub ? {
        questionId: sub.question_id.toString(),
        answerIndex: sub.answer_index,
        isCorrect: Boolean(sub.is_correct),
        submittedAt: sub.created_at,
        pointsAwarded: sub.points_awarded
      } : null;
    }).filter(Boolean);

    const isLocked = formattedSubmissions.length === 5;

    // Backward compatibility outputs
    const activeQuestion = isLocked ? formattedQuestions[4] : formattedQuestions[formattedSubmissions.length];
    const lastSubmission = formattedSubmissions.length > 0 ? formattedSubmissions[formattedSubmissions.length - 1] : null;

    const responsePayload = {
      employee: {
        id: employeeRow.user_id.toString(),
        name: employeeRow.username,
        points: employeeRow.points,
        streak: employeeRow.streak,
        lastQuizDate: employeeRow.last_quiz_date
      },
      // New format keys
      questions: formattedQuestions,
      submissions: formattedSubmissions,
      currentQuestionIndex: isLocked ? 5 : formattedSubmissions.length,

      // Old compatibility keys
      question: activeQuestion,
      submission: lastSubmission,
      isLocked,
      countdownMs: getCountdownMs()
    };

    return res.json(responsePayload);
  } catch (error) {
    console.error("Error in getDailyQuizState:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.submitDailyQuiz = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { employeeId, answerIndex, questionId } = req.body;
    const today = getTodayDateString();
    const yesterday = getYesterdayDateString();

    // 1. Fetch user/employee stats
    const [employees] = await connection.execute(
      "SELECT * FROM quiz_employee_stats WHERE user_id = ? OR username = ?",
      [employeeId, employeeId]
    );

    if (employees.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Employee profile not found." });
    }

    const employeeRow = employees[0];

    // Fetch user's company_id from customer table
    let companyId = null;
    const [customerRows] = await connection.execute(
      "SELECT company_id FROM customer WHERE user_id = ?",
      [employeeRow.user_id]
    );
    if (customerRows.length > 0) {
      companyId = customerRows[0].company_id;
    }

    // 2. Fetch today's 5 questions to determine the active one
    const todayQuestions = await getTodayQuestions(companyId, connection);
    if (todayQuestions.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "No questions active." });
    }

    // Determine target question
    let targetQuestion = null;
    if (questionId) {
      targetQuestion = todayQuestions.find(q => q.id.toString() === questionId.toString());
    } else {
      // Find the first unanswered question
      const questionIds = todayQuestions.map(q => q.id);
      const [subs] = await connection.execute(
        `SELECT question_id FROM quiz_submissions 
         WHERE user_id = ? AND submitted_date = ? AND question_id IN (${questionIds.join(',')})`,
        [employeeRow.user_id, today]
      );
      const answeredSet = new Set(subs.map(s => s.question_id.toString()));
      targetQuestion = todayQuestions.find(q => !answeredSet.has(q.id.toString()));
    }

    if (!targetQuestion) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Challenge already completed or invalid question ID today." });
    }

    // 3. Check if this specific question is already answered today
    const [existing] = await connection.execute(
      "SELECT submission_id FROM quiz_submissions WHERE user_id = ? AND question_id = ? AND submitted_date = ?",
      [employeeRow.user_id, targetQuestion.id, today]
    );

    if (existing.length > 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "This question has already been answered today." });
    }

    const isCorrect = answerIndex === targetQuestion.correct_index;
    const pointsAwarded = isCorrect ? targetQuestion.points : 0;

    // 4. Calculate streak progress (streak increases if all 5 are completed today, or progressive logic.
    // Let's increment daily streak when they successfully submit any question today, provided they didn't submit yesterday.
    // To prevent double streak increases on the same day, we check if they already had submissions today.)
    const [todayCountRows] = await connection.execute(
      `SELECT COUNT(*) as count FROM quiz_submissions 
       WHERE user_id = ? AND submitted_date = ?`,
      [employeeRow.user_id, today]
    );
    const hasAlreadyAnsweredToday = todayCountRows[0].count > 0;

    let newStreak = employeeRow.streak;
    if (!hasAlreadyAnsweredToday) {
      if (employeeRow.last_quiz_date === yesterday) {
        newStreak = employeeRow.streak + 1;
      } else if (employeeRow.last_quiz_date !== today) {
        newStreak = 1;
      }
    }

    // 5. Update Employee Points, Streak, last_quiz_date
    const newPoints = employeeRow.points + pointsAwarded;
    await connection.execute(
      "UPDATE quiz_employee_stats SET points = ?, streak = ?, last_quiz_date = ? WHERE user_id = ?",
      [newPoints, newStreak, today, employeeRow.user_id]
    );

    // 6. Insert Submission log
    await connection.execute(
      `INSERT INTO quiz_submissions 
       (user_id, question_id, answer_index, is_correct, points_awarded, submitted_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [employeeRow.user_id, targetQuestion.id, answerIndex, isCorrect ? 1 : 0, pointsAwarded, today]
    );

    await connection.commit();

    // Fetch refreshed leaderboard (company-specific if user belongs to a company)
    let leaderboardQuery = "SELECT * FROM quiz_employee_stats ORDER BY points DESC, streak DESC LIMIT 10";
    let leaderboardParams = [];
    if (companyId) {
      leaderboardQuery = `
        SELECT q.* FROM quiz_employee_stats q
        JOIN customer c ON q.user_id = c.user_id
        WHERE c.company_id = ?
        ORDER BY q.points DESC, q.streak DESC
        LIMIT 10
      `;
      leaderboardParams = [companyId];
    }
    const [leaders] = await db.execute(leaderboardQuery, leaderboardParams);

    const formattedLeaders = leaders.map((lead) => ({
      id: lead.user_id.toString(),
      name: lead.username,
      points: lead.points,
      streak: lead.streak,
      lastQuizDate: lead.last_quiz_date
    }));

    return res.json({
      success: true,
      employee: {
        id: employeeRow.user_id.toString(),
        name: employeeRow.username,
        points: newPoints,
        streak: newStreak,
        lastQuizDate: today
      },
      submission: {
        questionId: targetQuestion.id.toString(),
        answerIndex,
        isCorrect,
        submittedAt: new Date().toISOString(),
        pointsAwarded
      },
      leaderboard: formattedLeaders,
      countdownMs: getCountdownMs()
    });

  } catch (error) {
    await connection.rollback();
    console.error("Error submitting daily quiz:", error);
    return res.status(500).json({ success: false, message: "Submission failed" });
  } finally {
    connection.release();
  }
};

exports.getLeaderboard = async (req, res) => {
  try {
    const companyId = req.query.companyId || null;
    let query = "SELECT * FROM quiz_employee_stats ORDER BY points DESC, streak DESC LIMIT 10";
    let params = [];

    if (companyId) {
      query = `
        SELECT q.* FROM quiz_employee_stats q
        JOIN customer c ON q.user_id = c.user_id
        WHERE c.company_id = ?
        ORDER BY q.points DESC, q.streak DESC
        LIMIT 10
      `;
      params = [companyId];
    }

    const [leaders] = await db.execute(query, params);

    const formattedLeaders = leaders.map((lead) => ({
      id: lead.user_id.toString(),
      name: lead.username,
      points: lead.points,
      streak: lead.streak,
      lastQuizDate: lead.last_quiz_date
    }));

    return res.json(formattedLeaders);
  } catch (error) {
    console.error("Error fetching quiz leaderboard:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch leaderboard" });
  }
};

exports.getRewardsCatalog = async (req, res) => {
  try {
    const [rewards] = await db.execute("SELECT * FROM quiz_rewards");
    const formatted = rewards.map((rew) => ({
      id: rew.id,
      name: rew.name,
      emoji: rew.emoji,
      cost: rew.cost,
      stock: rew.stock
    }));

    return res.json(formatted);
  } catch (error) {
    console.error("Error fetching rewards catalog:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch rewards catalog" });
  }
};

exports.redeemReward = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { employeeId, rewardId } = req.body;

    // 1. Fetch user/employee stats
    const [employees] = await connection.execute(
      "SELECT * FROM quiz_employee_stats WHERE user_id = ? OR username = ?",
      [employeeId, employeeId]
    );

    if (employees.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Employee profile not found." });
    }

    const employeeRow = employees[0];

    // 2. Fetch reward details
    const [rewards] = await connection.execute(
      "SELECT * FROM quiz_rewards WHERE id = ?",
      [rewardId]
    );

    if (rewards.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Reward not found." });
    }

    const rewardRow = rewards[0];

    if (rewardRow.stock <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "This reward is out of stock." });
    }

    if (employeeRow.points < rewardRow.cost) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Not enough points to redeem." });
    }

    // 3. Deduct points and stock
    const newPoints = employeeRow.points - rewardRow.cost;
    const newStock = rewardRow.stock - 1;

    await connection.execute(
      "UPDATE quiz_employee_stats SET points = ? WHERE user_id = ?",
      [newPoints, employeeRow.user_id]
    );

    await connection.execute(
      "UPDATE quiz_rewards SET stock = ? WHERE id = ?",
      [newStock, rewardId]
    );

    await connection.commit();

    // Fetch refreshed leaderboard
    const [leaders] = await db.execute(
      "SELECT * FROM quiz_employee_stats ORDER BY points DESC, streak DESC LIMIT 10"
    );

    const formattedLeaders = leaders.map((lead) => ({
      id: lead.user_id.toString(),
      name: lead.username,
      points: lead.points,
      streak: lead.streak,
      lastQuizDate: lead.last_quiz_date
    }));

    return res.json({
      success: true,
      employee: {
        id: employeeRow.user_id.toString(),
        name: employeeRow.username,
        points: newPoints,
        streak: employeeRow.streak,
        lastQuizDate: employeeRow.last_quiz_date
      },
      reward: {
        id: rewardRow.id,
        name: rewardRow.name,
        emoji: rewardRow.emoji,
        cost: rewardRow.cost,
        stock: newStock
      },
      leaderboard: formattedLeaders
    });

  } catch (error) {
    await connection.rollback();
    console.error("Error redeeming reward:", error);
    return res.status(500).json({ success: false, message: "Redemption failed" });
  } finally {
    connection.release();
  }
};

exports.setActiveEmployee = async (req, res) => {
  try {
    const { employeeId } = req.body;

    const [employees] = await db.execute(
      "SELECT * FROM quiz_employee_stats WHERE user_id = ? OR username = ?",
      [employeeId, employeeId]
    );

    if (employees.length === 0) {
      // Auto register from eusers if exists
      const [eusers] = await db.execute(
        "SELECT user_id, name FROM eusers WHERE user_id = ? OR name = ?",
        [employeeId, employeeId]
      );

      if (eusers.length > 0) {
        const u = eusers[0];
        await db.execute(
          "INSERT INTO quiz_employee_stats (user_id, username, points, streak) VALUES (?, ?, 0, 0)",
          [u.user_id, u.name]
        );
      } else {
        const fallbackId = isNaN(employeeId) ? 999 : parseInt(employeeId);
        const fallbackName = isNaN(employeeId) ? employeeId : `Employee_${employeeId}`;
        await db.execute(
          "INSERT IGNORE INTO quiz_employee_stats (user_id, username, points, streak) VALUES (?, ?, 0, 0)",
          [fallbackId, fallbackName]
        );
      }
    }

    return res.json({ success: true, activeEmployeeId: employeeId });
  } catch (error) {
    console.error("Error setting active employee:", error);
    return res.status(500).json({ success: false, message: "Failed to set active employee" });
  }
};
