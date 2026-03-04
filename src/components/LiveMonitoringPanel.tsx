/**
 * LiveMonitoringPanel - Real-time visibility into scanning activity
 * 
 * Shows:
 * - Scanner status (running/stopped)
 * - Market hours status
 * - Recent scan activity log
 * - Active signals
 */

import React, { useState, useEffect, useRef } from 'react';

const API_BASE = 'http://localhost:3001/api';

interface ScanHistoryItem {
    timestamp: string;
    type: 'SWING' | 'INTRADAY' | 'V2.1_INTRADAY';
    categoryKey: string;
    signalsFound: number;
}

interface SchedulerStatus {
    isRunning: boolean;
    isMarketHours: boolean;
    scheduleInfo: {
        swingIntervalMin: number;
        intradayIntervalMin: number;
        marketOpen: string;
        marketClose: string;
    };
    swingCategories: string[];
    intradayCategories: string[];
    v21Enabled: boolean;
    v21Strategy: string;
    v21Categories: string[];
    disabledCategories: string[];
    recentScans: ScanHistoryItem[];
}

interface StrategyInfo {
    id: string;
    name: string;
    status: string;
}


const LiveMonitoringPanel: React.FC = () => {
    const [status, setStatus] = useState<SchedulerStatus | null>(null);
    const [registry, setRegistry] = useState<Record<string, StrategyInfo>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const logRef = useRef<HTMLDivElement>(null);

    // Fetch status every 5 seconds
    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await fetch(`${API_BASE}/signals/scheduler/status`);
                const data = await res.json();
                if (data.ok !== false) {
                    setStatus(data);
                    setError(null);
                }
            } catch (e) {
                console.error('Failed to fetch scheduler status:', e);
                setError('Failed to connect to backend');
            } finally {
                setLoading(false);
            }
        };



        const fetchRegistry = async () => {
            try {
                const res = await fetch(`${API_BASE}/strategy/registry`);
                const data = await res.json();
                if (data.success) {
                    setRegistry(data.registry);
                }
            } catch (e) {
                console.error('Failed to fetch registry:', e);
            }
        };

        fetchStatus();
        fetchRegistry();
        const interval = setInterval(fetchStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    // Auto-scroll activity log
    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = 0; // Keep newest at top
        }
    }, [status?.recentScans]);

    const startScheduler = async () => {
        setActionLoading(true);
        try {
            const res = await fetch(`${API_BASE}/signals/scheduler/start`, { method: 'POST' });
            const data = await res.json();
            if (data.ok) {
                setStatus(prev => prev ? { ...prev, isRunning: true } : null);
            }
        } catch (e) {
            console.error('Failed to start scheduler:', e);
        } finally {
            setActionLoading(false);
        }
    };

    const stopScheduler = async () => {
        setActionLoading(true);
        try {
            const res = await fetch(`${API_BASE}/signals/scheduler/stop`, { method: 'POST' });
            const data = await res.json();
            if (data.ok) {
                setStatus(prev => prev ? { ...prev, isRunning: false } : null);
            }
        } catch (e) {
            console.error('Failed to stop scheduler:', e);
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <div className="animate-pulse flex items-center gap-2">
                    <div className="w-3 h-3 bg-slate-600 rounded-full"></div>
                    <div className="h-4 bg-slate-600 rounded w-32"></div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-900/20 rounded-lg p-6 border border-red-500/40">
                <div className="text-red-400">⚠️ {error}</div>
            </div>
        );
    }

    const formatTime = (isoString: string) => {
        const date = new Date(isoString);
        return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    return (
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
            {/* Header */}
            <div className="bg-slate-900/50 px-4 py-3 border-b border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${status?.isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                    <h3 className="font-semibold text-white">🔴 Live Monitoring</h3>
                    {status?.v21Enabled && (
                        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded text-xs font-semibold">
                            V2.1 ✓
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {status?.isRunning ? (
                        <button
                            onClick={stopScheduler}
                            disabled={actionLoading}
                            className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-sm transition-all disabled:opacity-50"
                        >
                            ⏹️ Stop
                        </button>
                    ) : (
                        <button
                            onClick={startScheduler}
                            disabled={actionLoading}
                            className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-sm transition-all disabled:opacity-50"
                        >
                            ▶️ Start
                        </button>
                    )}
                </div>
            </div>

            {/* V2.1 Strategy Banner */}
            {status?.v21Enabled && (
                <div className="bg-emerald-900/20 border-b border-emerald-500/30 px-4 py-3">
                    <div className="flex flex-wrap gap-4 items-center">
                        <div className="flex items-center gap-2">
                            <span className="text-emerald-400 font-semibold text-sm">📊 Strategies:</span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {status.v21Categories?.map(cat => {
                                const strat = registry[cat];
                                return (
                                    <div key={cat} className="flex items-center gap-2 px-3 py-1 bg-emerald-600/20 border border-emerald-500/30 rounded text-xs">
                                        <span className="text-emerald-300 font-bold">{cat}</span>
                                        {strat && (
                                            <>
                                                <span className="text-slate-400">|</span>
                                                <span className="text-emerald-100">{strat.name}</span>
                                                <span className={`px-1 rounded text-[10px] items-center flex ${strat.status === 'PRODUCTION' ? 'bg-green-500 text-black font-bold' : 'bg-yellow-500 text-black'}`}>
                                                    {strat.status}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Status Grid */}
            <div className="p-4 grid grid-cols-4 gap-4 border-b border-slate-700">
                <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                    <div className={`text-lg font-bold ${status?.isRunning ? 'text-green-400' : 'text-red-400'}`}>
                        {status?.isRunning ? 'RUNNING' : 'STOPPED'}
                    </div>
                    <div className="text-xs text-slate-400">Scanner</div>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                    <div className={`text-lg font-bold ${status?.isMarketHours ? 'text-green-400' : 'text-yellow-400'}`}>
                        {status?.isMarketHours ? 'OPEN' : 'CLOSED'}
                    </div>
                    <div className="text-xs text-slate-400">Market</div>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-cyan-400">
                        {status?.swingCategories?.length || 0}
                    </div>
                    <div className="text-xs text-slate-400">Swing (15min)</div>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-orange-400">
                        {status?.intradayCategories?.length || 0}
                    </div>
                    <div className="text-xs text-slate-400">Intraday (1min)</div>
                </div>
            </div>

            {/* Category Lists */}
            <div className="p-4 grid grid-cols-2 gap-4 border-b border-slate-700">
                <div>
                    <h4 className="text-sm font-semibold text-slate-400 mb-2">📈 Swing Categories</h4>
                    <div className="space-y-1 max-h-24 overflow-y-auto text-xs">
                        {status?.swingCategories?.slice(0, 5).map(cat => (
                            <div key={cat} className="text-slate-300">• {cat}</div>
                        ))}
                        {(status?.swingCategories?.length || 0) > 5 && (
                            <div className="text-slate-500">...and {(status?.swingCategories?.length || 0) - 5} more</div>
                        )}
                    </div>
                </div>
                <div>
                    <h4 className="text-sm font-semibold text-slate-400 mb-2">⚡ Intraday Categories</h4>
                    <div className="space-y-1 max-h-24 overflow-y-auto text-xs">
                        {status?.intradayCategories?.map(cat => (
                            <div key={cat} className="text-slate-300">• {cat}</div>
                        ))}
                        {!status?.intradayCategories?.length && (
                            <div className="text-slate-500">None configured</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Activity Log */}
            <div className="p-4">
                <h4 className="text-sm font-semibold text-slate-400 mb-3">📋 Recent Activity</h4>
                <div ref={logRef} className="space-y-2 max-h-48 overflow-y-auto">
                    {status?.recentScans?.length === 0 && (
                        <div className="text-center text-slate-500 py-4">
                            No scan activity yet. Start the scheduler to begin.
                        </div>
                    )}
                    {status?.recentScans?.map((scan, i) => (
                        <div
                            key={i}
                            className={`flex items-center gap-2 text-xs p-2 rounded ${scan.signalsFound > 0
                                ? 'bg-green-900/20 border border-green-500/30'
                                : 'bg-slate-700/30'
                                }`}
                        >
                            <span className="text-slate-400 w-16">{formatTime(scan.timestamp)}</span>
                            <span className={`px-2 py-0.5 rounded text-xs ${scan.type === 'INTRADAY'
                                ? 'bg-orange-600/30 text-orange-400'
                                : 'bg-cyan-600/30 text-cyan-400'
                                }`}>
                                {scan.type}
                            </span>
                            <span className="text-slate-300 flex-1">{scan.categoryKey}</span>
                            <span className={`font-bold ${scan.signalsFound > 0 ? 'text-green-400' : 'text-slate-500'}`}>
                                {scan.signalsFound > 0 ? `🎯 ${scan.signalsFound} signal${scan.signalsFound > 1 ? 's' : ''}` : '—'}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default LiveMonitoringPanel;
