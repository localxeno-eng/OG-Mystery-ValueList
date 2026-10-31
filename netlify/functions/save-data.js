const { getStore } = require('@netlify/blobs');
const { verifySessionToken } = require('./lib/session-store');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  }

  const authHeader = event.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token || !verifySessionToken(token)) {
    return { statusCode: 401, body: JSON.stringify({ success: false, error: 'Invalid or expired session' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Malformed JSON' }) };
  }

  if (!payload || typeof payload !== 'object') {
    return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Invalid payload' }) };
  }

  try {
    const store = getStore('psog-site-data');
    await store.setJSON('main', {
      settings: payload.settings || {},
      categories: payload.categories || [],
      pets: payload.pets || [],
      updateLogs: payload.updateLogs || []
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: err.message || 'Storage write failed' })
    };
  }
};
