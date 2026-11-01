import seedData from './lib/seed-data.js';
import { issueSessionToken, verifySessionToken } from './lib/session-store.js';

const CORS_JSON = { 'Content-Type': 'application/json' };

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_JSON, ...extraHeaders }
  });
}

function getSessionSecret(env) {
  return env.SESSION_SECRET || env.ADMIN_ACCESS_CODE || 'fallback-dev-secret-change-me';
}

async function handleGetData(env) {
  try {
    const raw = await env.PSOG_KV.get('main');
    let record = raw ? JSON.parse(raw) : null;

    if (!record) {
      record = seedData;
      await env.PSOG_KV.put('main', JSON.stringify(seedData));
    }

    return json(record, 200, { 'Cache-Control': 'no-store' });
  } catch (err) {
    return json(seedData, 200, { 'Cache-Control': 'no-store' });
  }
}

async function handleSaveData(request, env) {
  if (request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405);
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token || !(await verifySessionToken(token, getSessionSecret(env)))) {
    return json({ success: false, error: 'Invalid or expired session' }, 401);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return json({ success: false, error: 'Malformed JSON' }, 400);
  }

  if (!payload || typeof payload !== 'object') {
    return json({ success: false, error: 'Invalid payload' }, 400);
  }

  try {
    const record = {
      settings: payload.settings || {},
      categories: payload.categories || [],
      pets: payload.pets || [],
      updateLogs: payload.updateLogs || []
    };
    await env.PSOG_KV.put('main', JSON.stringify(record));
    return json({ success: true });
  } catch (err) {
    return json({ success: false, error: err.message || 'Storage write failed' }, 500);
  }
}

async function handleVerifyCode(request, env) {
  if (request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405);
  }

  const ADMIN_ACCESS_CODE = env.ADMIN_ACCESS_CODE || 'OGMYSTRY_1972_VLSS_1_APP_9820172839921';
  const ip = request.headers.get('cf-connecting-ip') || '127.0.0.1';
  const lockoutKey = `lockout:${ip}`;

  const lockoutRaw = await env.PSOG_KV.get(lockoutKey);
  const now = Date.now();
  const attemptInfo = lockoutRaw ? JSON.parse(lockoutRaw) : { count: 0, lockoutUntil: 0 };

  if (attemptInfo.lockoutUntil > now) {
    const remainingSec = Math.ceil((attemptInfo.lockoutUntil - now) / 1000);
    return json({ success: false, error: `Too many failed attempts. Locked out for ${remainingSec}s.` }, 429);
  }

  let code = '';
  try {
    const data = await request.json();
    code = String(data.code || '');
  } catch (e) {
    return json({ success: false, error: 'Malformed JSON' }, 400);
  }

  const isMatch = code.length === ADMIN_ACCESS_CODE.length && code === ADMIN_ACCESS_CODE;

  if (isMatch) {
    await env.PSOG_KV.delete(lockoutKey);
    const sessionToken = await issueSessionToken(getSessionSecret(env));
    return json({ success: true, token: sessionToken });
  }

  const newCount = attemptInfo.count + 1;
  const lockout = newCount >= 5 ? now + 60 * 1000 : 0;
  await env.PSOG_KV.put(lockoutKey, JSON.stringify({ count: newCount, lockoutUntil: lockout }), {
    expirationTtl: 300
  });

  return json({
    success: false,
    error: newCount >= 5
      ? 'Too many failed attempts. Access locked for 60 seconds.'
      : `Invalid authorization code. Attempt ${newCount} of 5.`
  }, 401);
}

function formatVisits(n) {
  if (n >= 1000000000) return (n / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B+';
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M+';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K+';
  return n.toLocaleString();
}

async function handleRobloxStats() {
  const ROBLOX_PLACE_ID = '72561942097633';
  try {
    const universeRes = await fetch(
      `https://apis.roblox.com/universes/v1/places/${ROBLOX_PLACE_ID}/universe`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PSOG-Values/1.0)', Accept: 'application/json' } }
    );
    const universeData = await universeRes.json();
    const universeId = universeData.universeId;
    if (!universeId) throw new Error('Could not resolve universe ID');

    const gameRes = await fetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PSOG-Values/1.0)', Accept: 'application/json' }
    });
    const gameData = await gameRes.json();
    const game = gameData.data?.[0];
    if (!game) throw new Error('Game data not found');

    return json({
      success: true,
      active: game.playing?.toLocaleString() ?? '—',
      favorites: formatVisits(game.favoritedCount ?? 0),
      visits: formatVisits(game.visits ?? 0),
      name: game.name
    }, 200, { 'Cache-Control': 'public, max-age=30', 'Access-Control-Allow-Origin': '*' });
  } catch (err) {
    return json({ success: false, error: err.message });
  }
}

async function handleUploadImage(request, env) {
  if (request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405);
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token || !(await verifySessionToken(token, getSessionSecret(env)))) {
    return json({ success: false, error: 'Invalid or expired session' }, 401);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return json({ success: false, error: 'Malformed JSON' }, 400);
  }

  const base64 = payload.base64;
  if (!base64 || typeof base64 !== 'string') {
    return json({ success: false, error: 'No image data provided' }, 400);
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await env.PSOG_KV.put(`img:${id}`, base64);

  return json({ success: true, path: `/api/image/${id}` });
}

async function handleServeImage(request, env, id) {
  const base64 = await env.PSOG_KV.get(`img:${id}`);
  if (!base64) return new Response('Not found', { status: 404 });

  const match = base64.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.*)$/);
  if (!match) return new Response('Invalid image data', { status: 500 });

  const contentType = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return new Response(bytes, {
    headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000, immutable' }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/get-data') return handleGetData(env);
    if (path === '/api/save-data') return handleSaveData(request, env);
    if (path === '/api/verify-code') return handleVerifyCode(request, env);
    if (path === '/api/roblox-stats') return handleRobloxStats();
    if (path === '/api/upload-image') return handleUploadImage(request, env);

    const imageMatch = path.match(/^\/api\/image\/([^/]+)$/);
    if (imageMatch) return handleServeImage(request, env, imageMatch[1]);

    if (path.startsWith('/api/')) {
      return json({ success: false, error: 'Not found' }, 404);
    }

    // Everything else: serve the static site, rewriting /logs/<slug> to index.html
    // so client-side routing in app.js can take over.
    if (path.startsWith('/logs/')) {
      return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    }

    return env.ASSETS.fetch(request);
  }
};
