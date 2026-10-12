// Shared by all users calling this service in this Node process. Use one
// cover-processing instance per Poof account or replace with a distributed gate.
function createCoverImageBudget(now = Date.now) {
  let starts = [];
  return function reserve() {
    const time = now();
    starts = starts.filter(start => time - start < 60_000);
    if (starts.length >= 4) {
      throw Object.assign(new Error("Too many image processing requests. Please try again shortly."), {
        status: 429, code: "COVER_ACCOUNT_RATE_LIMITED",
        retryAfter: Math.max(1, Math.ceil((60_000 - (time - starts[0])) / 1000)),
      });
    }
    starts.push(time);
  };
}
const reserveCoverRequest = createCoverImageBudget();
module.exports = { reserveCoverRequest, createCoverImageBudget };
