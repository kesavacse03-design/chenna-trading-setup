import React, { useState, useEffect } from 'react';

const LiveTrackingStatus: React.FC = () => {
    const [status, setStatus] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStatus = async () => {
        try {
            // Use relative path relying on Vite proxy or standard API base handling
            const apiBase = (window as any).__CTS_API_BASE || '';
            const res = await fetch(`${apiBase}/api/tracking/intraday-status`);
            const data = await res.json();
            if (data.success) {
                setStatus(data.data);
                setError(null);
            } else {
                setError('Failed to fetch status');
            }
        } catch (err) {
            setError('Network error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 5000); // Poll every 5s
        return () => clearInterval(interval);
    }, []);

    if (loading && !status) return <div className="p-4 text-gray-400">Loading Monitor...</div>;
    if (error) return <div className="p-4 text-red-500">Monitor Error: {error}</div>;

    const { stats, isRunning, lastScanTime } = status || {};

    return (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-6 shadow-lg">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                    LIVE TRACKING STATUS
                </h3>
                <span className="text-xs text-gray-500">
                    Last Scan: {lastScanTime ? new Date(lastScanTime).toLocaleTimeString() : 'Never'}
                </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-800 p-3 rounded border border-gray-700">
                    <div className="text-xs text-gray-400">STOCKS SCANNED</div>
                    <div className="text-xl font-bold text-white">{stats?.totalStocks || 0}</div>
                </div>
                <div className="bg-gray-800 p-3 rounded border border-gray-700">
                    <div className="text-xs text-gray-400">VOLUME PASS</div>
                    <div className="text-xl font-bold text-blue-400">{stats?.volumePass || 0}</div>
                </div>
                <div className="bg-gray-800 p-3 rounded border border-gray-700">
                    <div className="text-xs text-gray-400">PATTERNS</div>
                    <div className="text-xl font-bold text-yellow-400">{stats?.nPatternFound || 0}</div>
                </div>
                <div className="bg-gray-800 p-3 rounded border border-gray-700 border-l-4 border-l-green-500">
                    <div className="text-xs text-gray-400">FRESH SIGNALS</div>
                    <div className="text-xl font-bold text-green-400">{stats?.finalSignals || 0}</div>
                </div>
            </div>

            <div className="mt-4 text-xs text-gray-500 flex justify-between">
                <span>Category: INTRADAY_BOOST</span>
                <span>Strategy: V2.1 ENHANCED</span>
            </div>
        </div>
    );
};

export default LiveTrackingStatus;
