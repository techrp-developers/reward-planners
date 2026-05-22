const jwt = require("jsonwebtoken");
const AuthModel = require("../models/authModel");

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer "))
      return res.status(401).json({ success: false });

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const user = await AuthModel.findById(decoded.user_id);

    if (!user || user.token_version !== decoded.token_version)
      return res.status(401).json({ success: false });

    if (Number(user.status) !== 1)
      return res.status(403).json({ success: false });

    req.user = user;
    next();

  } catch {
    return res.status(401).json({ success: false });
  }
};

module.exports = auth;


