const path = require('path');

describe('resourceManager throttling', () => {
  it('invokes onThrottle when cpuPercent exceeds limit (mocked)', () => {
    return new Promise((resolve, reject) => {
      const rmPath = path.resolve(__dirname, '..', 'resourceManager.cjs');
      const rm = require(rmPath);
      // monkeypatch sampleUsage to return high cpu
      const origSample = rm.sampleUsage;
      let called = false;
      rm.sampleUsage = () => ({ cpuPercent: 95, memRssMb: 123 });
      const monitor = rm.startMonitor({ intervalMs: 50, cpuLimit: 80, onThrottle: (u) => { called = true; try { monitor.stop(); } catch(_){ } rm.sampleUsage = origSample; try { expect(u.cpuPercent).toBeGreaterThan(80); resolve(); } catch (e) { reject(e); } }, onSample:()=>{} });
      // safety timeout
      setTimeout(()=>{ if (!called){ try { monitor.stop(); } catch(_){} rm.sampleUsage = origSample; reject(new Error('onThrottle not called')); } }, 500);
    });
  });
});
