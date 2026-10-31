const { getStore } = require('@netlify/blobs');
const seedData = require('./lib/seed-data');

exports.handler = async () => {
  try {
    const store = getStore('psog-site-data');
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
