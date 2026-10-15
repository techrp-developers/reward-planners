const multer = require("multer");
const rateLimit = require("express-rate-limit");

function requireCoverUser(req, res, next) {
  const id = req.user?.user_id;
  if (!req.user || req.user.role !== "vendor" ||
      !((typeof id === "number" || (typeof id === "string" && /^[1-9]\d*$/.test(id))) &&
        Number.isSafeInteger(Number(id)) && Number(id) > 0)) {
    return res.status(401).json({ success: false, code: "INVALID_COVER_USER", message: "A valid vendor session is required" });
  }
  req.coverUserId = String(Number(id));
  next();
}

const userLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user_${req.coverUserId}`,
  handler: (req, res) => res.status(429).json({ success: false, code: "COVER_IMAGE_RATE_LIMITED",
    message: "Too many cover image requests. Please wait and try again." }),
});

function coverImageLimiter(req, res, next) {
  requireCoverUser(req, res, () => userLimiter(req, res, next));
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
  fileFilter: (req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return cb(new Error("Only JPG, PNG and WebP images are allowed"));
    }
    cb(null, true);
  },
}).single("images");

function coverImageUpload(req, res, next) {
  upload(req, res, (error) => {
    if (!error) return next();
    const tooLarge = error.code === "LIMIT_FILE_SIZE";
    return res.status(tooLarge ? 413 : 400).json({ success: false, code: "INVALID_COVER_UPLOAD",
      message: tooLarge ? "Cover image must be 10 MB or smaller" : "Upload exactly one JPG, PNG or WebP image using the images field" });
  });
}
const activeUsers = new Map();
// The SDK cannot cancel after response headers. Hold the lock beyond the 65s
// response timeout, but never permanently lock a user on a hung body/promise.
const COVER_LOCK_MS = 120_000;
function coverImageConcurrency(req, res, next) {
  return requireCoverUser(req, res, () => {
    const user = req.coverUserId;
    if (activeUsers.has(user)) return res.status(429).json({ success: false,
      code: "COVER_IMAGE_IN_PROGRESS", message: "A cover image is already processing. Please wait." });
    const token = {};
    activeUsers.set(user, token);
    let processing = false;
    let timer;
    const release = () => {
      clearTimeout(timer);
      res.off("finish", onResponseEnd);
      res.off("close", onResponseEnd);
      // An expired old promise must never release a newer request's lock.
      if (activeUsers.get(user) === token) activeUsers.delete(user);
    };
    const onResponseEnd = () => { if (!processing) release(); };
    timer = setTimeout(release, COVER_LOCK_MS);
    timer.unref?.();
    res.once("finish", onResponseEnd);
    res.once("close", onResponseEnd);
    req.coverImageIsCurrent = () => activeUsers.get(user) === token;
    req.coverImageWork = (work) => {
      processing = true;
      clearTimeout(timer);
      timer = setTimeout(release, COVER_LOCK_MS);
      timer.unref?.();
      Promise.resolve(work).then(release, release);
    };
    next();
  });
}
module.exports = { coverImageUpload, coverImageLimiter, coverImageConcurrency, requireCoverUser, COVER_LOCK_MS };
