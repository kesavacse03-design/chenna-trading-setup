// scripts/optimize_dmart_cli.cjs
const http = require('http');

const payload = {
  symbols: ['DMART'],
  from: '2025-10-01',
  to: '2025-10-31',
  interval: 'day',
  mode: 'upstox',
  categoryKey: 'DOWNSIDE_LOM_SWING',
};

const data = JSON.stringify(payload);

const req = http.request(
  {
    hostname: '127.0.0.1',
    port: 3001,
    path: '/api/optimize/composite',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
  },
  (res) => {
    let body = '';
    res.on('data', (chunk) => (body += chunk));
    res.on('end', () => {
      console.log('STATUS', res.statusCode);
      console.log('BODY', body);
    });
  }
);

req.on('error', (err) => {
  console.error('ERR', err.message);
});

req.write(data);
req.end();