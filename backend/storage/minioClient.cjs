const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
let secretManager = null;
try { secretManager = require('./secretManager.cjs'); } catch (_) { secretManager = null; }

async function makeClient() {
  let endpoint = process.env.MINIO_ENDPOINT || process.env.S3_ENDPOINT || null;
  let region = process.env.S3_REGION || process.env.MINIO_REGION || 'us-east-1';
  let accessKey = process.env.S3_ACCESS_KEY || process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID;
  let secret = process.env.S3_SECRET_KEY || process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  let bucket = process.env.S3_BUCKET || process.env.MINIO_BUCKET;
  let forcePathStyle = !!process.env.S3_FORCE_PATH_STYLE || !!process.env.MINIO_FORCE_PATH_STYLE;
  if (secretManager) {
    try {
      const v = await secretManager.getSecret('secret/data/chenna/s3');
      if (v) {
        accessKey = accessKey || v.accessKey || v.access_key;
        secret = secret || v.secretKey || v.secret_key;
        bucket = bucket || v.bucket;
        endpoint = endpoint || v.endpoint;
        region = region || v.region;
        forcePathStyle = forcePathStyle || v.forcePathStyle;
      }
    } catch (_) {}
  }
  if (!bucket || !accessKey || !secret || !endpoint) throw new Error('S3/MINIO not configured (S3_BUCKET,S3_ENDPOINT,S3_ACCESS_KEY,S3_SECRET_KEY required)');
  const client = new S3Client({ region, endpoint, credentials: { accessKeyId: accessKey, secretAccessKey: secret }, forcePathStyle });
  return { client, bucket };
}

async function uploadFile(localPath, key) {
  const { client, bucket } = await makeClient();
  const body = fs.createReadStream(localPath);
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, Body: body });
  await client.send(cmd);
  return `s3://${bucket}/${key}`;
}

module.exports = { uploadFile };
