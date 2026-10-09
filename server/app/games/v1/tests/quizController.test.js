const { test } = require('node:test');
const assert = require('node:assert/strict');
const dbPath = require.resolve('../../../../config/database');
const players = new Map();
let rollbacks = 0;
const connection = {
  async beginTransaction() {}, async commit() {}, async rollback() { rollbacks++; }, release() {},
  async query() { return [Array.from({ length: 5 }, (_, id) => ({ id, question: 'Question', options: '["A","B","C","D"]', correct_index: 1 }))]; },
  async execute(sql, args) {
    if (sql.startsWith('INSERT')) {
      if (!players.has(args[0])) players.set(args[0], { state: null, total_games: 0, best_score: null });
      return [{}];
    }
    if (sql.startsWith('SELECT')) return [[players.get(args[0])]];
    if (sql.startsWith('UPDATE')) {
      const player = players.get(args[5]);
      player.state = args[0];
      if (args[1]) player.best_score = Math.max(player.best_score ?? args[2], args[3]);
      player.total_games += args[4];
      return [{}];
    }
    throw new Error('Unexpected query');
  },
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getConnection: async () => connection } };
const controller = require('../controller/quizController');

async function call(method, user, id, body = {}) {
  const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; } };
  await controller[method]({ user: { user_id: user }, params: { id }, body }, res);
  return res;
}
test('sessions resume, belong to their owner, and completion is idempotent', async () => {
  const first = (await call('start', 1)).value.data;
  const resumed = (await call('start', 1)).value.data;
  assert.equal(first.id, resumed.id);
  assert.equal(first.deadline, resumed.deadline);
  assert.equal((await call('get', 2, first.id)).code, 404);
  assert.equal(rollbacks, 1);
  for (let index = 0; index < 5; index++) {
    await call('answer', 1, first.id, { index, option: 0 });
    await call('answer', 1, first.id, { index, option: 0 });
    await call('answer', 1, first.id, { index, option: 1 });
    await call('next', 1, first.id, { index });
    const replay = await call('next', 1, first.id, { index });
    assert.equal(replay.value.data.index, Math.min(index + 1, 4));
  }
  assert.equal(players.get(1).total_games, 1);
  assert.equal(players.get(1).best_score, 5);
  const result = (await call('get', 1, first.id)).value.data;
  assert.equal(result.status, 'completed');
  assert.equal(result.score, 5);
  assert.equal(result.question.correctIndex, undefined);
  assert.notEqual((await call('start', 1)).value.data.id, first.id);
});
