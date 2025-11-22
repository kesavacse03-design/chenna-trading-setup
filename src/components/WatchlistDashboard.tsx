import React, { useMemo, useState, useEffect } from 'react';
import { useWatchlistStore } from '../store/watchlistStore';

const WatchlistDashboard: React.FC = () => {
  const { rows, clear, fetchData } = useWatchlistStore();
  const [filter, setFilter] = useState<'ALL' | 'SWING' | 'INTRADAY'>('ALL');

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const normalize = (s: string) =>
    (s || '')
      .toString()
      .toUpperCase()
      .replace(/[\s–\-]+/g, '_')
      .replace(/[^A-Z0-9_]/g, '_')
      .replace(/__+/g, '_')
      .replace(/^_+|_+$/g, '');

  const swingList = [
    'DOWNSIDE_LOM_SWING',
    'UPSIDE_LOM_SWING',
    'MULTI_RESISTANCE_BO',
    'MULTI_SUPPORT_BO',
    'SHORT_TERM_SWING_BO_UP',
    'SHORT_TERM_SWING_BO_DOWN',
    'LONG_TERM_SWING_BO_UP',
    'LONG_TERM_SWING_BO_DOWN',
  ].map(normalize);

  const intradayList = [
    'HIGH_POWERED_STOCKS',
    'INTRADAY_BOOST',
    'DOWNSIDE_LOM_INTRA',
    'UPSIDE_LOM_INTRA',
    'DAILY_CONTRACTION',
    'PRE_MARKET',
  ].map(normalize);

  const swingCategories = new Set(swingList);
  const intradayCategories = new Set(intradayList);

  const filteredRows = useMemo(() => {
    if (filter === 'ALL') return rows;
    if (filter === 'SWING') return rows.filter((r) => swingCategories.has(normalize(r.category || '')));
    return rows.filter((r) => intradayCategories.has(normalize(r.category || '')));
  }, [rows, filter]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2>Active Watchlist</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setFilter('ALL')} className={`px-3 py-1 rounded ${filter === 'ALL' ? 'bg-slate-700' : ''}`}>
            ALL
          </button>
          <button onClick={() => setFilter('SWING')} className={`px-3 py-1 rounded ${filter === 'SWING' ? 'bg-slate-700' : ''}`}>
            SWING CENTER
          </button>
          <button onClick={() => setFilter('INTRADAY')} className={`px-3 py-1 rounded ${filter === 'INTRADAY' ? 'bg-slate-700' : ''}`}>
            INTRADAY
          </button>
          <button onClick={clear} disabled={rows.length === 0} className="px-3 py-1 rounded border">
            Clear
          </button>
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <p>Your watchlist is empty. Import symbols to get started.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Name</th>
              <th>Date</th>
              <th>Category</th>
              <th>Price</th>
              <th>Exchange</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, idx) => (
              <tr key={idx}>
                <td>{row.symbol}</td>
                <td>{(row as any).name}</td>
                <td>{row.date}</td>
                <td>
                  <span className="px-2 py-1 rounded bg-slate-700 text-xs">{row.category}</span>
                </td>
                <td>{(row as any).price ?? '—'}</td>
                <td>{(row as any).exchange}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default WatchlistDashboard;