const { getStore } = require('@netlify/blobs');
const seedData = require('./lib/seed-data');

function openStore() {
  if (process.env.NETLIFY_SITE_ID && process.env.BLOBS_TOKEN) {
    return getStore({
      name: 'psog-site-data',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.BLOBS_TOKEN
    });
  }
  return getStore('psog-site-data');
}

exports.handler = async () => {
  try {
    const store = openStore();
    let record = await store.get('main', { type: 'json' });

    if (!record) {
      await store.setJSON('main', seedData);
      record = seedData;
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify(record)
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify(seedData)
    };
  }
};
