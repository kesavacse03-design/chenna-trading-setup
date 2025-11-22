const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Simple AES-GCM encryption/decryption for short secrets
function encrypt(text, keyB64) {
  const key = Buffer.from(keyB64, 'base64');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(blobB64, keyB64) {
  const key = Buffer.from(keyB64, 'base64');
  const raw = Buffer.from(blobB64, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

class TokenManager {
  constructor(opts = {}) {
  // Prefer explicit /app/.data paths when running in container so code doesn't depend on cwd
  const defaultDataRoot = '/app/.data';
  this.dir = opts.dir || path.join(defaultDataRoot, 'secrets');
  this.file = opts.file || path.join(this.dir, 'upstox.token');
  // Optional writable override directory/file (used when primary is read-only, e.g., Secret mount)
  this.overrideDir = opts.overrideDir || path.join(defaultDataRoot, 'secrets-override');
  this.overrideFile = opts.overrideFile || path.join(this.overrideDir, 'upstox.token');
    this.kEnv = opts.kEnv || 'TOKENS_ENCRYPTION_KEY';
  }

  ensureDir() { try { fs.mkdirSync(this.dir, { recursive: true }); } catch(_){} }
  ensureOverrideDir() { try { fs.mkdirSync(this.overrideDir, { recursive: true }); } catch(_){} }

  loadToken() {
    // Priority: env var; else encrypted file (requires key); else null
    if (process.env.UPSTOX_ACCESS_TOKEN) return process.env.UPSTOX_ACCESS_TOKEN;
    // Prefer override file if present, but if decrypt fails try the other file
    const key = process.env[this.kEnv];
    if (!key) throw new Error('Token file present but no TOKENS_ENCRYPTION_KEY in env');

    const tryLoad = (p) => {
      if (!fs.existsSync(p)) return null;
      const b64 = fs.readFileSync(p, 'utf8').trim();
      try {
        const data = JSON.parse(decrypt(b64, key));
        return data && data.access_token ? data.access_token : null;
      } catch (e) {
        // surface the decrypt error upwards for logging
        throw new Error(`decrypt-failed:${p}:${String(e && e.message || e)}`);
      }
    };

    // attempt override first, then primary
    const overrideExists = fs.existsSync(this.overrideFile);
    if (overrideExists) {
      try {
        return tryLoad(this.overrideFile);
      } catch (e) {
        // fall back to primary on decrypt failure
        try {
          return tryLoad(this.file);
        } catch (e2) {
          // combine errors
          throw new Error(`override-failed:${String(e.message||e)}; primary-failed:${String(e2.message||e2)}`);
        }
      }
    }

    // no override, try primary
    try {
      return tryLoad(this.file);
    } catch (e) {
      throw new Error(`primary-decrypt-failed:${String(e.message||e)}`);
    }
  }

  loadRefreshToken() {
    const candidate = fs.existsSync(this.overrideFile) ? this.overrideFile : this.file;
    if (!fs.existsSync(candidate)) return null;
    const key = process.env[this.kEnv];
    if (!key) return null;
    const b64 = fs.readFileSync(candidate, 'utf8').trim();
    const data = JSON.parse(decrypt(b64, key));
    return data.refresh_token;
  }

  saveTokens(accessToken, refreshToken) {
    const key = process.env[this.kEnv];
    if (!key) throw new Error('TOKENS_ENCRYPTION_KEY env not set');
    this.ensureDir();
    const data = { access_token: accessToken, refresh_token: refreshToken };
    const blob = encrypt(JSON.stringify(data), key);
    try {
      fs.writeFileSync(this.file, blob, 'utf8');
    } catch (err) {
      // Fall back to override path if primary is read-only (e.g., mounted Secret)
      if (err && (err.code === 'EROFS' || err.code === 'EPERM')) {
        this.ensureOverrideDir();
        fs.writeFileSync(this.overrideFile, blob, 'utf8');
      } else {
        throw err;
      }
    }
    return this.file;
  }
}

module.exports = { TokenManager, encrypt, decrypt };
