const assert = require('assert');
const path = require('path');
const adaptersPath = path.resolve(__dirname, '..', 'dataAdapter.cjs');
// We'll monkeypatch axios if present
function withMockAxios(mockResp, fn) {
  const cacheKey = require.resolve(adaptersPath);
  delete require.cache[cacheKey];
  const axiosMock = { get: async () => ({ status: 200, data: mockResp }) };
  const saved = global.__TEST_AXIOS__;
  global.__TEST_AXIOS__ = axiosMock;
  try { return fn(); } finally { global.__TEST_AXIOS__ = saved; delete require.cache[cacheKey]; }
}

async function testHappyPath() {
  const v2payload = { data: { candles: [ [163, 100, 101, 99, 100.5, 1000] ] } };
  await withMockAxios(v2payload, async () => {
    const { UpstoxAdapter } = require(adaptersPath);
    const up = new UpstoxAdapter();
    const out = await up.fetch({ symbol:'FOO', from:'2025-10-30', to:'2025-10-30', interval:'5m' });
    assert(Array.isArray(out), 'happy path should return array');
  });
}

async function testEmptyArray() {
  const v3payload = { status: 'success', data: { candles: [] } };
  await withMockAxios(v3payload, async () => {
    const { UpstoxAdapter } = require(adaptersPath);
    const up = new UpstoxAdapter();
    const out = await up.fetch({ symbol:'FOO', from:'2025-10-30', to:'2025-10-30', interval:'5m' });
    assert(Array.isArray(out), 'empty result should be array');
    assert(out.length === 0, 'empty array should be length 0');
  });
}

module.exports = async function run(){
  await testHappyPath();
  await testEmptyArray();
};
