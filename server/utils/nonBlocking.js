function runNonBlocking(task, label = "background task") {
  setImmediate(() => {
    Promise.resolve()
      .then(task)
      .catch((err) => {
        console.error(`[NON_BLOCKING] ${label} failed:`, err);
      });
  });
}

module.exports = { runNonBlocking };
