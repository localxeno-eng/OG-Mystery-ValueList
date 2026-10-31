const crypto = require('crypto');

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.ADMIN_ACCESS_CODE || 'fallback-dev-secret-change-me';
const SESSION_TTL_MS = 15 * 60 * 1000;

function issueSessionToken() {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${expiresAt}.${nonce}`;
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}.${signature}`).toString('base64url');
}

function verifySessionToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split('.');
    if (parts.length !== 3) return false;

    const [expiresAtStr, nonce, signature] = parts;
    const expiresAt = Number(expiresAtStr);
    if (!expiresAt || Date.now() > expiresAt) return false;

    const payload = `${expiresAtStr}.${nonce}`;
    const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');

    const a = Buffer.from(signature);
    const b = Buffer.from(expectedSignature);
    if (a.length !== b.length) return false;

    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

module.exports = { issueSessionToken, verifySessionToken };
