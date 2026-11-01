const SESSION_TTL_MS = 15 * 60 * 1000;

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function base64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(b64url) {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  let out = '';
  for (let i = 0; i < bin.length; i++) out += bin[i];
  return out;
}

async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return bufToHex(sig);
}

function timingSafeEqualStr(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function issueSessionToken(secret) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = bufToHex(nonceBytes);
  const payload = `${expiresAt}.${nonce}`;
  const signature = await hmacHex(secret, payload);
  return base64urlEncode(`${payload}.${signature}`);
}

export async function verifySessionToken(token, secret) {
  try {
    const decoded = base64urlDecode(token);
    const parts = decoded.split('.');
    if (parts.length !== 3) return false;

    const [expiresAtStr, nonce, signature] = parts;
    const expiresAt = Number(expiresAtStr);
    if (!expiresAt || Date.now() > expiresAt) return false;

    const payload = `${expiresAtStr}.${nonce}`;
    const expectedSignature = await hmacHex(secret, payload);

    return timingSafeEqualStr(signature, expectedSignature);
  } catch (e) {
    return false;
  }
}
