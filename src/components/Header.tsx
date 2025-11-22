import React from 'react';
import * as api from '../api';
import * as storage from '../utils/storage';

const Header: React.FC = () => {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const debug = params.get('debug') === 'true';
  const onDebug = async () => {
    const today = new Date().toISOString().slice(0,10);
    try {
      const res = await api.createStock({ symbol: 'TITAN', date: today, category: 'HIGH POWERED STOCKS' } as any);
      console.log('createStock result', res);
    } catch (e) { console.warn('createStock failed', e); }
    try { console.log('cts_stocks', JSON.parse(localStorage.getItem('cts_stocks')||'[]')); } catch(_){}
    try { console.log('grouped watchlist', storage.getWatchlist()); } catch(_){}
    try { window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: 'Debug createStock executed (see console)', kind: 'info' } })); } catch(_){}
  };

  return (
    <header>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-wider text-center sm:text-left">Chenna Trading System</h1>
        {debug && (
          <div>
            <button onClick={onDebug} className="text-xs bg-yellow-600 text-black px-3 py-1 rounded">Debug: create TITAN</button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;