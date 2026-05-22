// utils/r2SignedUrl.js
const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const r2 = require("../config/r2");

const BUCKET = process.env.R2_BUCKET_NAME;

async function getPrivateFileUrl(key) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  return await getSignedUrl(r2, command, { expiresIn: 60 * 5 }); 
}

module.exports = { getPrivateFileUrl };