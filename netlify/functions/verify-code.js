const crypto = require('crypto');
const { issueSessionToken } = require('./lib/session-store');

const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || 'OGMYSTRY_1972_VLSS_1_APP_9820172839921';
const failedAttempts = new Map();

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  const ip = event.headers['client-ip'] || event.headers['x-forwarded-for'] || '127.0.0.1';
  const now = Date.now();
  const attemptInfo = failedAttempts.get(ip) || { count: 0, lockoutUntil: 0 };

  if (attemptInfo.lockoutUntil > now) {
    const remainingSec = Math.ceil((attemptInfo.lockoutUntil - now) / 1000);
    return {
      statusCode: 429,
      body: JSON.stringify({
        success: false,
        error: `Too many failed attempts. Locked out for ${remainingSec}s.`
      })
    };
  }

  let code = '';
  try {
    const data = JSON.parse(event.body || '{}');
    code = String(data.code || '');
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: 'Malformed JSON' })
    };
  }

  const safeSubmitted = Buffer.from(code);
  const safeTarget = Buffer.from(ADMIN_ACCESS_CODE);

  let isMatch = false;
  if (safeSubmitted.length === safeTarget.length) {
    isMatch = crypto.timingSafeEqual(safeSubmitted, safeTarget);
  }

  if (isMatch) {
    failedAttempts.delete(ip);
    const sessionToken = issueSessionToken();
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, token: sessionToken })
    };
  } else {
    const newCount = attemptInfo.count + 1;
    const lockout = newCount >= 5 ? now + 60 * 1000 : 0;
    failedAttempts.set(ip, { count: newCount, lockoutUntil: lockout });

    return {
      statusCode: 401,
      body: JSON.stringify({
        success: false,
        error: newCount >= 5
          ? 'Too many failed attempts. Access locked for 60 seconds.'
          : `Invalid authorization code. Attempt ${newCount} of 5.`
      })
    };
  }
};