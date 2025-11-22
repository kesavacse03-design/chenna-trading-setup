import { hydrateIntoGrouped, flattenGrouped, buildBaseWatchlist } from '../utils/hydrateWatchlist';

describe('watchlist hydration utility', () => {
  it('hydrates server stocks into canonical grouped structure and flattens', () => {
    const serverStocks = [
      { stockName: 'INFY', category: 'HIGH_POWERED_STOCKS', date: '2025-11-01' },
      { stockName: 'TCS', category: 'HIGH_POWERED_STOCKS', date: '2025-11-02' }
    ];
    const base = buildBaseWatchlist();
    const grouped = hydrateIntoGrouped(serverStocks, base);
    const flat = flattenGrouped(grouped);
    const symbols = flat.map(r => r.symbol);
    expect(symbols).toEqual(expect.arrayContaining(['INFY', 'TCS']));
  });
});
