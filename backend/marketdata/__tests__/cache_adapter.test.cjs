const fs = require('fs');
const os = require('os');
const path = require('path');
const { CacheAdapter } = require('../adapters/cache.cjs');

function mkdtemp(){
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-adapter-test-'));
  return base;
}

describe('CacheAdapter', ()=>{
  test('getHistorical returns [] when file missing', async ()=>{
    const dir = mkdtemp();
    const a = new CacheAdapter({ baseDir: dir });
    const res = await a.getHistorical('NOFILE', '2025-01-01', '2025-12-31');
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBe(0);
  });

  test('appendCandles creates file and getHistorical returns items in range', async ()=>{
    const dir = mkdtemp();
    const a = new CacheAdapter({ baseDir: dir });
    const candles = [
      { date: '2025-10-01T00:00:00.000Z', open:1,high:2,low:0.5,close:1.5,volume:100 },
      { date: '2025-10-02T00:00:00.000Z', open:2,high:3,low:1.5,close:2.5,volume:200 },
    ];
    const ok = a.appendCandles('TST', candles);
    expect(ok).toBe(true);

    const resAll = await a.getHistorical('TST', '2025-10-01', '2025-10-03');
    expect(Array.isArray(resAll)).toBe(true);
    expect(resAll.length).toBe(2);

    const resOne = await a.getHistorical('TST', '2025-10-02', '2025-10-02');
    expect(resOne.length).toBe(1);
    expect(new Date(resOne[0].date).toISOString()).toBe('2025-10-02T00:00:00.000Z');
  });

  test('appendCandles dedupes and preserves sort order', async ()=>{
    const dir = mkdtemp();
    const a = new CacheAdapter({ baseDir: dir });
    const initial = [
      { date: '2025-10-01T00:00:00.000Z', open:1 },
      { date: '2025-10-03T00:00:00.000Z', open:3 },
    ];
    expect(a.appendCandles('DED', initial)).toBe(true);

    const more = [
      { date: '2025-10-02T00:00:00.000Z', open:2 },
      { date: '2025-10-03T00:00:00.000Z', open:33 }, // should overwrite
    ];
    expect(a.appendCandles('DED', more)).toBe(true);

    const all = await a.getHistorical('DED', '2025-10-01', '2025-10-04');
    expect(all.map(c=>c.open)).toEqual([1,2,33]);
  });

  test('getHistorical returns error object for invalid JSON', async ()=>{
    const dir = mkdtemp();
    const a = new CacheAdapter({ baseDir: dir });
    const fp = path.join(dir, 'BAD.json');
    fs.writeFileSync(fp, '{ this is not json', 'utf8');
    const res = await a.getHistorical('BAD', '2025-01-01', '2025-12-31');
    expect(res && res.ok === false).toBe(true);
    expect(res.error).toBe('cache-read-failed');
  });

  test('other simple APIs', ()=>{
    const dir = mkdtemp();
    const a = new CacheAdapter({ baseDir: dir });
    expect(a.getProviderName()).toBe('CACHE');
    return Promise.resolve()
      .then(()=>a.getTick('X'))
      .then(t=>expect(t).toBeNull())
      .then(()=>a.lookupInstrument('X'))
      .then(r=>expect(r && r.symbol).toBe('X'))
      .then(()=>{
        const sub = a.subscribeTicks('X', ()=>{});
        expect(typeof sub.unsubscribe).toBe('function');
      });
  });
});
