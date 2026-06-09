module.exports = (req, res, next) => {
  const appStatus = req.appStatus;

  if (appStatus?.drain_mode) {
    return res.status(503).json({
      success: false,
      drain_mode: true,
      message:
        "New transactions are temporarily disabled due to scheduled maintenance.",
    });
  }

  next();
};
