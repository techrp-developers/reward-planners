// utils/r2Delete.js
const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const r2 = require("../config/r2");

const BUCKET = process.env.R2_BUCKET_NAME;

async function deleteFromR2(key) {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  await r2.send(command);
}

module.exports = { deleteFromR2 };