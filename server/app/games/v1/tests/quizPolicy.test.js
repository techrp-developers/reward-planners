const { test } = require('node:test');
const assert = require('node:assert/strict');
const { answer, expire, next, publicState } = require('../quizPolicy');

const makeState = () => ({
  id: 'round-1', status: 'playing', index: 0, score: 0, correctCount: 0, wrongCount: 0,
  attempts: [], selected: null, feedback: null, deadline: 15000,
  questions: Array.from({ length: 5 }, () => ({ question: 'Capital?', options: ['Mumbai', 'Delhi', 'Pune', 'Goa'], correctIndex: 1 })),
});

test('wrong attempts deduct points; retries preserve the deadline', () => {
  const state = makeState();
  answer(state, 0, 1000);
  answer(state, 2, 2000);
  assert.equal(state.score, -2);
  assert.equal(state.deadline, 15000);
  answer(state, 1, 3000);
  assert.equal(state.score, 0);
  assert.equal(state.correctCount, 1);
  assert.equal(state.wrongCount, 2);
});
test('replayed answers cannot double-penalize or double-reward', () => {
  const state = makeState();
  answer(state, 0, 1000);
  answer(state, 0, 2000);
  assert.equal(state.score, -1);
  answer(state, 1, 3000);
  answer(state, 1, 4000);
  answer(state, 2, 5000);
  assert.equal(state.score, 1);
});
test('deadline is exclusive, late answers incur only one timeout penalty', () => {
  const state = makeState();
  answer(state, 1, 15000);
  expire(state, 16000);
  answer(state, 0, 17000);
  assert.equal(state.score, -1);
  assert.equal(state.correctCount, 0);
  assert.equal(state.feedback, 'timeout');
});
test('correct answer before expiry does not later incur a timeout penalty', () => {
  const state = makeState();
  answer(state, 1, 14999);
  expire(state, 99999);
  assert.equal(state.score, 2);
});
test('cannot skip unanswered questions; advancing starts a fresh timer', () => {
  const state = makeState();
  next(state, 1000);
  assert.equal(state.index, 0);
  answer(state, 1, 2000);
  next(state, 4000);
  assert.equal(state.index, 1);
  assert.equal(state.deadline, 19000);
  assert.deepEqual(state.attempts, []);
  assert.equal(state.selected, null);
});
test('expired questions can advance and final completion cannot score twice', () => {
  const state = makeState();
  for (let index = 0; index < 5; index++) next(state, state.deadline);
  assert.equal(state.status, 'completed');
  assert.equal(state.score, -5);
  next(state, 999999);
  assert.equal(state.score, -5);
});
test('responses omit answer keys and future questions', () => {
  const exposed = publicState(makeState(), 1000);
  assert.equal(exposed.questions, undefined);
  assert.equal(exposed.question.correctIndex, undefined);
  assert.equal(exposed.serverNow, 1000);
});
