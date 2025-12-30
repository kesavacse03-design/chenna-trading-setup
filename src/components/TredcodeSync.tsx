// src/components/TredcodeSync.tsx
// Component to sync stocks from tredcode.tradingcafeindia.com
// Uses popup window approach so user can login with their Google account

import { useState, useEffect } from 'react';
import './TredcodeSync.css';

const API_BASE = (window as any).__CTS_API_BASE || (import.meta as any).env?.VITE_API_BASE || 'http://localhost:3001';

interface SyncStatus {
    ok: boolean;
    lastFetchTime: string | null;
    isRunning: boolean;
    stats: {
        fetched: number;
        changed: number;
        skipped: number;
        inserted: number;
    };
}

export default function TredcodeSync() {
    const [isOpen, setIsOpen] = useState(false);
    const [status, setStatus] = useState<SyncStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [popupWindow, setPopupWindow] = useState<Window | null>(null);

    // Fetch status on mount
    useEffect(() => {
        fetchStatus();
    }, []);

    const fetchStatus = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/data-fetch/status`);
            const data = await res.json();
            setStatus(data);
        } catch (err) {
            console.error('Failed to fetch status:', err);
        }
    };

    // Open tredcode in popup window for login
    const openTredcodePopup = (page: 'swing-center' | 'pro-setups' | 'market-depth') => {
        const url = `https://tredcode.tradingcafeindia.com/${page}`;
        const popup = window.open(url, 'tredcode_sync', 'width=1400,height=900,scrollbars=yes,resizable=yes');
        setPopupWindow(popup);

        if (popup) {
            // Check if popup is closed periodically
            const checkClosed = setInterval(() => {
                if (popup.closed) {
                    clearInterval(checkClosed);
                    setPopupWindow(null);
                }
            }, 1000);
        }
    };

    // Trigger server-side fetch (for when Puppeteer works with cookies)
    const triggerServerFetch = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/data-fetch/run`, { method: 'POST' });
            const data = await res.json();
            setStatus(data);

            // Show toast
            window.dispatchEvent(new CustomEvent('cts:toast', {
                detail: {
                    message: data.stats?.inserted > 0
                        ? `✅ Synced ${data.stats.inserted} stocks from tredcode`
                        : '⚠️ No new stocks found (check login status)',
                    kind: data.stats?.inserted > 0 ? 'success' : 'info'
                }
            }));
        } catch (err) {
            console.error('Fetch failed:', err);
            window.dispatchEvent(new CustomEvent('cts:toast', {
                detail: { message: '❌ Sync failed - check backend logs', kind: 'error' }
            }));
        } finally {
            setLoading(false);
        }
    };

    // Start scheduled fetching
    const startScheduler = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/data-fetch/start`, { method: 'POST' });
            void res.json(); // consume response
            window.dispatchEvent(new CustomEvent('cts:toast', {
                detail: { message: '⏰ Auto-sync started (every 10 min)', kind: 'success' }
            }));
        } catch (err) {
            console.error('Failed to start scheduler:', err);
        }
    };

    if (!isOpen) {
        return (
            <button
                className="tredcode-sync-btn"
                onClick={() => setIsOpen(true)}
                title="Sync stocks from Tredcode"
            >
                🔄 Tredcode Sync
            </button>
        );
    }

    return (
        <div className="tredcode-sync-overlay" onClick={() => setIsOpen(false)}>
            <div className="tredcode-sync-modal" onClick={e => e.stopPropagation()}>
                <div className="tredcode-sync-header">
                    <h2>🔄 Tredcode Stock Sync</h2>
                    <button className="close-btn" onClick={() => setIsOpen(false)}>×</button>
                </div>

                <div className="tredcode-sync-body">
                    {/* Status Section */}
                    <div className="sync-status-section">
                        <h3>Sync Status</h3>
                        {status ? (
                            <div className="status-info">
                                <p>Last Sync: {status.lastFetchTime ? new Date(status.lastFetchTime).toLocaleString() : 'Never'}</p>
                                <p>Status: {status.isRunning ? '🔄 Running...' : '✅ Idle'}</p>
                                <p className="stats">
                                    Fetched: {status.stats.fetched} |
                                    New: {status.stats.inserted} |
                                    Skipped: {status.stats.skipped}
                                </p>
                            </div>
                        ) : (
                            <p>Loading status...</p>
                        )}
                    </div>

                    {/* Manual Login Section */}
                    <div className="sync-section">
                        <h3>📱 Step 1: Login to Tredcode</h3>
                        <p className="helper-text">
                            Click a button below to open Tredcode in a popup. Login with your Google account there.
                        </p>
                        <div className="page-buttons">
                            <button onClick={() => openTredcodePopup('swing-center')}>
                                📊 Swing Center
                            </button>
                            <button onClick={() => openTredcodePopup('pro-setups')}>
                                🎯 Pro Setups
                            </button>
                            <button onClick={() => openTredcodePopup('market-depth')}>
                                📈 Market Depth
                            </button>
                        </div>
                        {popupWindow && !popupWindow.closed && (
                            <p className="popup-status">✅ Popup window open - login there!</p>
                        )}
                    </div>

                    {/* Copy Data Instructions */}
                    <div className="sync-section">
                        <h3>📋 Step 2: Copy Stock Data</h3>
                        <p className="helper-text">
                            After logging in, you can manually copy the stock tables from Tredcode and paste into the Import tab.
                            <br /><br />
                            <strong>Format:</strong> SYMBOL, DATE, CATEGORY (one per line)
                        </p>
                    </div>

                    {/* Auto-Fetch Section (when Puppeteer cookies work) */}
                    <div className="sync-section">
                        <h3>⚙️ Advanced: Server-Side Fetch</h3>
                        <p className="helper-text">
                            Note: Server-side fetch requires the browser window to be open with valid login.
                            Google blocks automated logins.
                        </p>
                        <div className="action-buttons">
                            <button
                                onClick={triggerServerFetch}
                                disabled={loading}
                                className="primary-btn"
                            >
                                {loading ? '⏳ Fetching...' : '🚀 Try Server Fetch'}
                            </button>
                            <button onClick={startScheduler} className="secondary-btn">
                                ⏰ Start Auto-Sync
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
