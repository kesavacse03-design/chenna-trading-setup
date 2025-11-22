/*
 * @jest-environment jsdom
 */
import { useEffect, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';

// Mocked persisted job JSON and results payload
const mockJob = {
  runId: 'run-1762082038322',
  summary: { totalPnL: -317, winRate: 0.123, tradesCount: 1, avgReturn: -0.00185 },
  perSymbol: {
    MOCKD: {
      trades: 1,
      netPnl: -317,
      winRate: 0.0,
      avgReturn: -0.00185,
      profitFactor: 0
    }
  },
  insights: [ { symbol: 'MOCKD', suggest: 'Increase stop to reduce false stops', confidence: 0.6 } ],
  status: 'done',
  createdAt: new Date().toISOString(),
  completedAt: new Date().toISOString()
};

beforeEach(() => {
  global.fetch = jest.fn((input: RequestInfo) => {
    const url = String(input);
    if (url.includes('/api/backtest/result/')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, result: mockJob, source: 'test' }) } as any);
    }
    if (url.includes('/strategy/results/')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: { metrics: { trades: 1, winRate: 0.123, netPnl: -317, avgReturn: -0.00185, profitFactor: 0 }, perSymbol: mockJob.perSymbol } } ) } as any);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as any);
  }) as any;
});

// Small test harness that performs the same mapping logic as Workbench and renders minimal UI
function TestHarness() {
  const [metrics, setMetrics] = useState<any>(null);
  const [perSymbol, setPerSymbol] = useState<any>(null);
  const [learnings, setLearnings] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch('/strategy/results/run-1762082038322');
      const resJson = await res.json();
      const resObj = resJson.results || resJson || null;
      const raw = resObj?.metrics || null;
      if (raw) {
        const trades = Number(raw.trades || raw.tradesCount || 0);
        const winRate = typeof raw.winRate === 'number' ? raw.winRate : 0;
        const avgReturnPct = typeof raw.avgReturn === 'number' ? (raw.avgReturn * 100) : undefined;
        const profitFactor = typeof raw.profitFactor === 'number' ? raw.profitFactor : undefined;
        const totalPnL = typeof raw.netPnl === 'number' ? raw.netPnl : undefined;
        const passed = Math.round((winRate || 0) * trades);
        const failed = trades - passed;
        setMetrics({ tested: trades, winRate, avgReturnPct, profitFactor, totalPnL, passed, failed });
      }
      setPerSymbol(resObj?.perSymbol || {});
      const jr = await fetch('/api/backtest/result/run-1762082038322').then(r=>r.json()).catch(()=>null);
      const jobObj = jr?.result || null;
      const insights = Array.isArray(jobObj?.insights) ? jobObj.insights : [];
      setLearnings(insights);
    })();
  }, []);

  return (
    <div>
      <div data-testid="aggregate">{metrics ? `win rate ${(metrics.winRate*100).toFixed(1)}%` : 'no metrics'}</div>
      <div data-testid="per-symbol">
        {Object.keys(perSymbol || {}).map((s)=> <div key={s}><span>{s}</span> - <span>{perSymbol[s].netPnl}</span></div>)}
      </div>
      <div data-testid="insights">
        {learnings.map((l,i) => <div key={i}>{l.suggest}</div>)}
      </div>
    </div>
  );
}

test('maps and displays aggregate metrics, per-symbol trade and insights', async () => {
  render(<TestHarness />);
  await waitFor(() => expect(screen.getByTestId('aggregate').textContent).toMatch(/12.3%/));
  await waitFor(() => expect(screen.getByTestId('per-symbol').textContent).toMatch(/MOCKD/));
  await waitFor(() => expect(screen.getByTestId('per-symbol').textContent).toMatch(/-317/));
  await waitFor(() => expect(screen.getByTestId('insights').textContent).toMatch(/Increase stop to reduce false stops/));
});
