const RULES = Object.freeze({ questionCount: 5, secondsPerQuestion: 15, correctPoints: 2, wrongPenalty: 1, timeoutPenalty: 1 });

function expire(state, now) {
  if (state.status === 'playing' && state.feedback === null && now >= state.deadline) {
    state.feedback = 'timeout';
    state.score -= RULES.timeoutPenalty;
  }
  return state;
}

function answer(state, option, now) {
  expire(state, now);
  if (state.status !== 'playing' || state.feedback !== null || state.attempts.includes(option)) return state;
  state.attempts.push(option);
  state.selected = option;
  if (option === state.questions[state.index].correctIndex) {
    state.score += RULES.correctPoints;
    state.correctCount += 1;
    state.feedback = 'correct';
  } else {
    state.score -= RULES.wrongPenalty;
    state.wrongCount += 1;
  }
  return state;
}

function next(state, now) {
  expire(state, now);
  if (state.status !== 'playing' || state.feedback === null) return state;
  if (state.index === state.questions.length - 1) state.status = 'completed';
  else {
    state.index += 1;
    state.attempts = [];
    state.selected = null;
    state.feedback = null;
    state.deadline = now + RULES.secondsPerQuestion * 1000;
  }
  return state;
}

function publicState(state, now) {
  const question = state.questions[state.index];
  return {
    id: state.id, status: state.status, index: state.index, total: state.questions.length,
    score: state.score, correctCount: state.correctCount, wrongCount: state.wrongCount,
    deadline: state.deadline, serverNow: now, attempts: state.attempts, selected: state.selected,
    feedback: state.feedback, rules: RULES,
    question: { question: question.question, options: question.options },
  };
}

module.exports = { RULES, expire, answer, next, publicState };
