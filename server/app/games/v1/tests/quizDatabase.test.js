const { test } = require('node:test');
const assert = require('node:assert/strict');

test('real database serializes concurrent scoring and completion', { skip: process.env.QUIZ_DB_TESTS !== '1' }, async () => {
  const db = require('../../../../config/database');
  const controller = require('../controller/quizController');
  // A reserved negative fixture id cannot collide with real auto-increment users.
  const userId = -Math.floor(100000000 + Math.random() * 1000000000);
  const [[existing]] = await db.execute('SELECT COUNT(*) AS count FROM quiz_players WHERE user_id = ?', [userId]);
  assert.equal(existing.count, 0);
  const call = async (method, id, body = {}) => {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; } };
    await controller[method]({ user: { user_id: userId }, params: { id }, body }, res);
    assert.equal(res.code, 200, JSON.stringify(res.value));
    return res.value.data;
  };
  try {
    const starts = await Promise.all([call('start'), call('start')]);
    assert.equal(starts[0].id, starts[1].id);
    const id = starts[0].id;
    const [[row]] = await db.execute('SELECT state FROM quiz_players WHERE user_id = ?', [userId]);
    const snapshot = typeof row.state === 'string' ? JSON.parse(row.state) : row.state;
    for (let index = 0; index < 5; index++) {
      const option = snapshot.questions[index].correctIndex;
      await Promise.all(Array.from({ length: 3 }, () => call('answer', id, { index, option: (option + 1) % 4 })));
      const answers = await Promise.all(Array.from({ length: 3 }, () => call('answer', id, { index, option })));
      assert.equal(answers[0].score, index + 1);
      await Promise.all(Array.from({ length: 3 }, () => call('next', id, { index })));
    }
    const [[result]] = await db.execute('SELECT best_score, total_games FROM quiz_players WHERE user_id = ?', [userId]);
    assert.equal(result.best_score, 5);
    assert.equal(result.total_games, 1);
    const fresh = await call('start');
    const [[active]] = await db.execute('SELECT state FROM quiz_players WHERE user_id = ?', [userId]);
    const state = typeof active.state === 'string' ? JSON.parse(active.state) : active.state;
    state.deadline = Date.now() - 1;
    await db.execute('UPDATE quiz_players SET state = ? WHERE user_id = ?', [JSON.stringify(state), userId]);
    const expired = await call('answer', fresh.id, { index: 0, option: state.questions[0].correctIndex });
    assert.equal(expired.feedback, 'timeout');
    assert.equal(expired.score, -1);
    assert.equal((await call('get', fresh.id)).score, -1);
  } finally {
    await db.execute('DELETE FROM quiz_players WHERE user_id = ?', [userId]);
    await db.end();
  }
});
