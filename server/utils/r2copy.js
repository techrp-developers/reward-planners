const { CopyObjectCommand } = require("@aws-sdk/client-s3");
const r2 = require("../config/r2");

const BUCKET = process.env.R2_BUCKET_NAME;

async function copyInR2(sourceKey, destinationKey) {
  const encodedSource = `${BUCKET}/${String(sourceKey).split("/").map(encodeURIComponent).join("/")}`;
  await r2.send(new CopyObjectCommand({
    Bucket: BUCKET,
    CopySource: encodedSource,
    Key: destinationKey,
  }));
  return destinationKey;
}

module.exports = { copyInR2 };
