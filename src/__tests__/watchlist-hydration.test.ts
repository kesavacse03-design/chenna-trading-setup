/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import * as api from '../api';
import { PREPOPULATED_WATCHLIST } from '../constants';
import AnalysisHub from '../components/AnalysisHub';
import { useWatchlistStore } from '../store/watchlistStore';

// Mock getStocks to return a couple of items that should hydrate into rows
jest.spyOn(api, 'getStocks').mockImplementation(async () => [
  { stockName: 'INFY', category: 'HIGH_POWERED_STOCKS', date: '2025-11-01' },
  { stockName: 'TCS', category: 'HIGH_POWERED_STOCKS', date: '2025-11-02' }
]);

describe('watchlist hydration', () => {
  it('populates useWatchlistStore rows from existing stocks', async () => {
    // Ensure store starts empty
    useWatchlistStore.getState().clear();
    expect(useWatchlistStore.getState().rows.length).toBe(0);

    render(React.createElement(AnalysisHub, { watchlist: PREPOPULATED_WATCHLIST as any, onWatchlistUpdate: () => {}, onManageStrategy: () => {} }));

    await waitFor(() => {
      const rows = useWatchlistStore.getState().rows;
      expect(rows.length).toBeGreaterThanOrEqual(2);
      const symbols = rows.map(r => r.symbol).sort();
      expect(symbols).toEqual(expect.arrayContaining(['INFY', 'TCS']));
    }, { timeout: 4000 });
  });
});
