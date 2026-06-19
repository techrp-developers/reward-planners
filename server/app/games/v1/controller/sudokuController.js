const { getSudoku } = require("sudoku-gen");
const db = require("../../../../config/database");
const { notifyUser } = require("../../../common/utils/notification");

exports.startGame = async (req, res) => {
  try {
    const { difficulty } = req.body;

    // const userId=req.user?.user_id;
    const userId = 1;

    const sudoku = getSudoku(difficulty || "easy");

    const puzzle = sudoku.puzzle;
    const solution = sudoku.solution;

    const board = [];

    for (let i = 0; i < 9; i++) {
      const row = puzzle
        .slice(i * 9, i * 9 + 9)
        .split("")
        .map((v) => (v === "-" ? 0 : Number(v)));

      board.push(row);
    }

    const solutionBoard = [];

    for (let i = 0; i < 9; i++) {
      const row = solution
        .slice(i * 9, i * 9 + 9)
        .split("")
        .map(Number);

      solutionBoard.push(row);
    }

    const [result] = await db.execute(
      `INSERT INTO sudoku_games
      (user_id,difficulty, puzzle, solution)
      VALUES (?, ?, ?, ?)`,
      [userId, difficulty, puzzle, solution],
    );

    return res.json({
      success: true,
      game_id: result.insertId,
      board,
      solution: solutionBoard,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

exports.completeGame = async (req, res) => {
  try {
    const { game_id, completion_time, username } = req.body;

    // const userId=req.user?.user_id;
    const userId = 1;

    const [games] = await db.execute(
      `SELECT * FROM sudoku_games
       WHERE game_id = ?`,
      [game_id],
    );

    if (games.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    const game = games[0];

    // Difficulty Points
    const difficultyPoints = {
      easy: 1,
      medium: 2,
      hard: 4,
      expert: 7,
    };

    const basePoints = difficultyPoints[game.difficulty] || 1;

    // Speed Bonus
    let speedBonus = 0;

    if (completion_time < 120) {
      speedBonus = 5;
    } else if (completion_time < 300) {
      speedBonus = 3;
    } else if (completion_time < 600) {
      speedBonus = 2;
    } else {
      speedBonus = 1;
    }

    const totalPoints = basePoints + speedBonus;

    // Update Game
    await db.execute(
      `UPDATE sudoku_games
       SET completion_time = ?,
           status = 'completed',
           points_earned = ?
       WHERE game_id = ?`,
      [completion_time, totalPoints, game_id],
    );

    await db.execute(
      `INSERT IGNORE INTO sudoku_leaderboard
      (
        user_id,
        username
      )
      VALUES (?, ?)`,
      [userId, username],
    );

    // Difficulty column update
    let difficultyColumn = `${game.difficulty}_completed`;

    // Update leaderboard
    await db.execute(
      `UPDATE sudoku_leaderboard
       SET total_points =
            total_points + ?,

           total_games =
            total_games + 1,

           ${difficultyColumn} =
            ${difficultyColumn} + 1

       WHERE user_id = ?`,
      [totalPoints, userId],
    );

    notifyUser(
      {
        userId,
        module: "games",
        type: "sudoku_completed",
        title: "Sudoku completed",
        message: `You earned ${totalPoints} points for completing a ${game.difficulty} Sudoku.`,
        icon: "gamepad-2",
        reference_type: "sudoku_game",
        reference_id: game_id,
        action_url: "/games/sudoku/leaderboard",
        metadata: {
          difficulty: game.difficulty,
          completion_time,
          points_earned: totalPoints,
        },
      },
      "sudoku completed notification",
    );

    return res.json({
      success: true,
      message: "Game completed",
      points_earned: totalPoints,
    });
  } catch (error) {
    console.log(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

exports.getLeaderboard = async (req, res) => {
  try {
    const [leaders] = await db.execute(
      `SELECT
        user_id,
        username,
        total_points,
        total_games,
        easy_completed,
        medium_completed,
        hard_completed,
        expert_completed

      FROM sudoku_leaderboard

      ORDER BY total_points DESC

      LIMIT 10`,
    );

    return res.json({
      success: true,
      leaderboard: leaders,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
