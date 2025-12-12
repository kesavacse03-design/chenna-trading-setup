// Temporary wrapper to test WatchlistDashboard without modifying App.tsx
import React from 'react';
import WatchlistDashboard from './components/WatchlistDashboard';

export default function TestWatchlist() {
    return (
        <div className="min-h-screen bg-slate-950 p-6">
            <WatchlistDashboard />
        </div>
    );
}
