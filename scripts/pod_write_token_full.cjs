const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function encrypt(text, keyB64) {
  const key = Buffer.from(keyB64, 'base64');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

class TokenManagerLocal {
  constructor() {
    this.dir = path.join(process.cwd(), '.data', 'secrets');
    this.file = path.join(this.dir, 'upstox.token');
    this.overrideDir = path.join(process.cwd(), '.data', 'secrets-override');
    this.overrideFile = path.join(this.overrideDir, 'upstox.token');
    this.kEnv = 'TOKENS_ENCRYPTION_KEY';
  }
  ensureDir() { try { fs.mkdirSync(this.dir, { recursive: true }); } catch(_){} }
  ensureOverrideDir() { try { fs.mkdirSync(this.overrideDir, { recursive: true }); } catch(_){} }
  saveTokens(accessToken, refreshToken) {
    const key = process.env[this.kEnv];
    if (!key) throw new Error('TOKENS_ENCRYPTION_KEY env not set');
    this.ensureDir();
    const data = { access_token: accessToken, refresh_token: refreshToken };
    const blob = encrypt(JSON.stringify(data), key);
    try {
      fs.writeFileSync(this.file, blob, 'utf8');
    } catch (err) {
      if (err && (err.code === 'EROFS' || err.code === 'EPERM')) {
        this.ensureOverrideDir();
        fs.writeFileSync(this.overrideFile, blob, 'utf8');
        return this.overrideFile;
      } else {
        throw err;
      }
    }
    return this.file;
  }
}

(async function(){
  const key = process.argv[2] || process.env.TOKENS_ENCRYPTION_KEY;
  const token = process.argv[3] || 'SMOKE_TOKEN';
  const refresh = process.argv[4] || 'R';
  if (!key) { console.error('Missing encryption key'); process.exit(2); }
  process.env.TOKENS_ENCRYPTION_KEY = key;
  const tm = new TokenManagerLocal();
  try {
    const p = tm.saveTokens(token, refresh);
    console.log('WROTE', p);
    process.exit(0);
  } catch (e) {
    console.error('ERR', e && e.stack || e.message || e);
    process.exit(3);
  }
})();
