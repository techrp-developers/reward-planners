const retry = async (fn, retries = 2, delay = 1000) => {
  try {
    return await fn();
  } catch (err) {
    if (retries === 0) throw err;

    console.warn(`Retrying... Attempts left: ${retries}`);

    await new Promise((res) => setTimeout(res, delay));

    return retry(fn, retries - 1, delay);
  }
};

module.exports = retry;