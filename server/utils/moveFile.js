const fs = require("fs");
const path = require("path");

module.exports.moveFile = async (oldPath, newPath) => {
  // 1 Ensure destination directory exists
  await fs.promises.mkdir(path.dirname(newPath), { recursive: true });

  try {
    // 2 Fast path (same disk)
    await fs.promises.rename(oldPath, newPath);
  } catch (err) {
    // 3 Fallback for Windows / cross-device
    if (err.code === "EXDEV") {
      await fs.promises.copyFile(oldPath, newPath);
      await fs.promises.unlink(oldPath);
    } else {
      throw err;
    }
  }
};
