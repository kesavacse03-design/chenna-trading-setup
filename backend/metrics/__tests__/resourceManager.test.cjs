const path = require('path');
const rm = require(path.resolve(__dirname, '..', 'resourceManager.cjs'));

describe('resourceManager basic', () => {
  test('detectResources returns sane values', () => {
    const r = rm.detectResources();
    expect(typeof r.cpuCores).toBe('number');
    expect(r.cpuCores).toBeGreaterThanOrEqual(1);
    expect(typeof r.gpuDevices).toBe('number');
  });

  test('planConcurrency respects fraction', () => {
    const c1 = rm.planConcurrency(8, 0.5);
    expect(c1).toBeGreaterThanOrEqual(1);
    const c2 = rm.planConcurrency(1, 0.9);
    expect(c2).toBeGreaterThanOrEqual(1);
  });

  test('sampleUsage shape', () => {
    const u = rm.sampleUsage();
    expect(typeof u.cpuPercent).toBe('number');
    expect(typeof u.memRssMb).toBe('number');
  });
});
