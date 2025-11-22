// Minimal secret manager: prefers HashiCorp Vault if VAULT_ADDR and VAULT_TOKEN are present,
// otherwise falls back to environment variables. This is a small adapter that can be
// expanded to support Azure Key Vault or GCP Secret Manager as needed.

const fs = require('fs');
const path = require('path');
let vaultAvailable = !!(process.env.VAULT_ADDR && process.env.VAULT_TOKEN);

async function fetchVaultSecret(pathKey) {
  try {
    const fetch = require('node-fetch');
    const url = `${process.env.VAULT_ADDR}/v1/${pathKey}`;
    const r = await fetch(url, { headers: { 'X-Vault-Token': process.env.VAULT_TOKEN } });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.data ? j.data : null;
  } catch (e) { return null; }
}

async function getSecret(key) {
  // key examples: 'secret/data/chenna/s3' returns { data: { accessKey: '', secretKey: '', bucket: '' } }
  if (vaultAvailable) {
    const v = await fetchVaultSecret(key);
    if (v) return v;
  }
  // fallback: look for specific env vars matching key parts
  if (key.includes('s3')) {
    return {
      accessKey: process.env.S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
      secretKey: process.env.S3_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
      bucket: process.env.S3_BUCKET,
      endpoint: process.env.S3_ENDPOINT || process.env.MINIO_ENDPOINT,
      region: process.env.S3_REGION || process.env.MINIO_REGION,
    };
  }
  return null;
}

module.exports = { getSecret };
