const { randomUUID } = require('crypto');
const db = require('../../../../config/database');
const policy = require('../quizPolicy');
const parseJSON = value => typeof value === 'string' ? JSON.parse(value) : value;

// Lock one player row for every mutation: concurrent requests cannot double-score
// answers, restart a timer, or finish the same round twice.
async function mutate(req, res, operation) {
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const userId = req.user.user_id;
    await connection.execute('INSERT INTO quiz_players (user_id) VALUES (?) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)', [userId]);
    const [[player]] = await connection.execute('SELECT * FROM quiz_players WHERE user_id = ? FOR UPDATE', [userId]);
    let state = parseJSON(player.state);
    const wasCompleted = state?.status === 'completed';
    const now = Date.now();
    if (operation === 'start') {
      if (!state || state.status === 'completed') {
        const [rows] = await connection.query('SELECT id, question, options, correct_index FROM quiz_questions WHERE active = 1 ORDER BY RAND() LIMIT 5');
        if (rows.length < policy.RULES.questionCount) {
          const error = new Error('Not enough quiz questions are available yet.');
          error.status = 503;
          throw error;
        }
        state = {
          id: randomUUID(), status: 'playing', index: 0, score: 0, correctCount: 0, wrongCount: 0,
          attempts: [], selected: null, feedback: null,
          deadline: now + policy.RULES.secondsPerQuestion * 1000,
          questions: rows.map(row => ({ id: row.id, question: row.question, options: parseJSON(row.options), correctIndex: row.correct_index })),
        };
      }
    } else {
      if (!state || state.id !== req.params.id) {
        const error = new Error('Quiz session not found. Return to the leaderboard to start.');
        error.status = 404;
        throw error;
      }
      // A repeated request for an older question returns the latest state.
      if (operation !== 'get' && req.body.index === state.index) {
        if (operation === 'answer') policy.answer(state, req.body.option, now);
        if (operation === 'next') policy.next(state, now);
      }
    }
    policy.expire(state, now);
    const finished = !wasCompleted && state.status === 'completed';
    await connection.execute(
      `UPDATE quiz_players SET state = ?, best_score = CASE WHEN ? THEN GREATEST(COALESCE(best_score, ?), ?) ELSE best_score END,
       total_games = total_games + ? WHERE user_id = ?`,
      [JSON.stringify(state), finished ? 1 : 0, state.score, state.score, finished ? 1 : 0, userId],
    );
    await connection.commit();
    res.json({ success: true, data: policy.publicState(state, now) });
  } catch (error) {
    if (connection) await connection.rollback();
    if (!error.status) console.error('Quiz request failed:', error.code || error.message);
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Quiz is unavailable. Please try again.' });
  } finally {
    if (connection) connection.release();
  }
}

exports.start = (req, res) => mutate(req, res, 'start');
exports.get = (req, res) => mutate(req, res, 'get');
exports.answer = (req, res) => mutate(req, res, 'answer');
exports.next = (req, res) => mutate(req, res, 'next');
exports.leaderboard = async (req, res) => {
  try {
    const [rows] = await db.execute(`SELECT p.user_id, c.name, p.best_score AS score, p.total_games
      FROM quiz_players p JOIN customer c ON c.user_id = p.user_id
      WHERE p.best_score IS NOT NULL AND c.status = 1 ORDER BY p.best_score DESC, p.user_id ASC LIMIT 20`);
    res.json({ success: true, data: { players: rows, rules: policy.RULES } });
  } catch (error) {
    console.error('Quiz leaderboard failed:', error.code || error.message);
    res.status(500).json({ success: false, message: 'Leaderboard is unavailable. Please try again.' });
  }
};
