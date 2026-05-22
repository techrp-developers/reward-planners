  // utils/r2Upload.js
  const { PutObjectCommand } = require("@aws-sdk/client-s3");
  const r2 = require("../config/r2");

  const BUCKET = process.env.R2_BUCKET_NAME;

  async function uploadToR2(fileBuffer, key, contentType) {
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    });

    await r2.send(command);

    return key; 
  }

  module.exports = { uploadToR2 };