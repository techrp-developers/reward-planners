const retry = async (fn, retries = 2, delay = 1000) => {
  try {
    return await fn();
  } catch (err) {
    const statusCode = err.response?.status || err.statusCode;
    const isRetryable =
      !statusCode || statusCode === 408 || statusCode === 429 || statusCode >= 500;

    if (retries === 0 || !isRetryable) throw err;

    console.warn(`Retrying... Attempts left: ${retries}`);

    await new Promise((res) => setTimeout(res, delay));

    return retry(fn, retries - 1, delay);
  }
};

module.exports = retry;
