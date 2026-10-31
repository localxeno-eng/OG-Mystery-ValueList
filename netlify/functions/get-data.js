const { getStore } = require('@netlify/blobs');
const fs = require('fs');
const path = require('path');

exports.handler = async () => {
  const store = getStore('psog-site-data');
  let record = await store.get('main', { type: 'json' });

  if (!record) {
    const seedPath = path.join(__dirname, '..', '..', 'data.json');
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    await store.setJSON('main', seed);
    record = seed;
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(record)
  };
};
