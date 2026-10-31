const https = require('https');

const ROBLOX_PLACE_ID = '72561942097633';

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PSOG-Values/1.0)',
        'Accept': 'application/json'
      }
    };
    https.get(url, options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
    }).on('error', reject);
  });
}

function formatVisits(n) {
  if (n >= 1000000000) return (n / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B+';
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M+';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K+';
  return n.toLocaleString();
}

exports.handler = async () => {
  try {
    const universeData = await httpsGet(
      `https://apis.roblox.com/universes/v1/places/${ROBLOX_PLACE_ID}/universe`
    );
    const universeId = universeData.universeId;
    if (!universeId) throw new Error('Could not resolve universe ID');

    const gameData = await httpsGet(
      `https://games.roblox.com/v1/games?universeIds=${universeId}`
    );

    const game = gameData.data?.[0];
    if (!game) throw new Error('Game data not found');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        active: game.playing?.toLocaleString() ?? '—',
        favorites: formatVisits(game.favoritedCount ?? 0),
        visits: formatVisits(game.visits ?? 0),
        name: game.name
      })
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};