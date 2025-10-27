import React from 'react';
import { useWatchlistStore } from '../store/watchlistStore';

const WatchlistDashboard: React.FC = () => {
  const { rows, clear } = useWatchlistStore();

  return (
    <div>
      <h2>Active Watchlist</h2>

      <button onClick={clear} disabled={rows.length === 0}>
        Clear Watchlist
      </button>

      {rows.length === 0 ? (
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
            {rows.map((row, idx) => (
              <tr key={idx}>
                <td>{row.symbol}</td>
                <td>{row.name}</td>
                <td>{row.date}</td>
                <td>{row.category}</td>
                <td>{row.price ?? '—'}</td>
                <td>{row.exchange}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default WatchlistDashboard;