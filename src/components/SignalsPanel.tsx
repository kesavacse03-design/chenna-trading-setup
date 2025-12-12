/**
 * Signals Panel Component
 * Shows today's trading signals on the dashboard
 */

import React, { useState, useEffect } from 'react';

interface Signal {
    symbol: string;
    name?: string;
    price: number;
    target: number;
    stop: number;
    targetPercent: number;
    stopPercent: number;
    confidence: number;
    reason?: string;
    timestamp: string;
}

interface SignalsPanelProps {
    categoryKey?: string;
    onSignalClick?: (signal: Signal) => void;
}

const SignalsPanel: React.FC<SignalsPanelProps> = ({
    categoryKey = 'DOWNSIDE_LOM_SWING',
    onSignalClick
}) => {
    const [signals, setSignals] = useState<Signal[]>([]);
    const [loading, setLoading] = useState(false);
    const [lastScan, setLastScan] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isScanning, setIsScanning] = useState(false);

    const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';

    // Load signals on mount
    useEffect(() => {
        loadActiveSignals();
    }, [categoryKey]);

    const loadActiveSignals = async () => {
        try {
            const response = await fetch(`${apiBase}/api/signals/active`);
            const data = await response.json();

            if (data.ok) {
                setSignals(data.signals || []);
                setLastScan(data.lastScan);
            }
        } catch (err: any) {
            console.error('[Signals] Failed to load:', err);
        }
    };

    const runScan = async () => {
        setIsScanning(true);
        setError(null);

        try {
            const response = await fetch(`${apiBase}/api/signals/scan/${categoryKey}`);
            const data = await response.json();

            if (data.ok) {
                setSignals(data.signals || []);
                setLastScan(data.scannedAt);
            } else {
                setError(data.error || 'Scan failed');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsScanning(false);
        }
    };

    const getConfidenceColor = (confidence: number) => {
        if (confidence >= 70) return 'text-green-400 bg-green-500/20';
        if (confidence >= 50) return 'text-yellow-400 bg-yellow-500/20';
        return 'text-red-400 bg-red-500/20';
    };

    return (
        <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-xl border border-slate-700/50 p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    📡 Live Signals
                    {signals.length > 0 && (
                        <span className="px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-400 rounded-full">
                            {signals.length} active
                        </span>
                    )}
                </h3>
                <button
                    onClick={runScan}
                    disabled={isScanning}
                    className="px-3 py-1.5 text-sm bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                    {isScanning ? (
                        <>
                            <span className="animate-spin">⚡</span>
                            Scanning...
                        </>
                    ) : (
                        <>
                            🔍 Scan Now
                        </>
                    )}
                </button>
            </div>

            {/* Last scan time */}
            {lastScan && (
                <div className="text-xs text-slate-400 mb-3">
                    Last scan: {new Date(lastScan).toLocaleTimeString('en-IN')}
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="mb-3 p-2 bg-red-500/20 border border-red-500/30 rounded text-red-400 text-sm">
                    {error}
                </div>
            )}

            {/* Signals List */}
            <div className="space-y-2 max-h-80 overflow-y-auto">
                {signals.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                        <div className="text-3xl mb-2">🔎</div>
                        <div>No active signals</div>
                        <div className="text-sm mt-1">Click "Scan Now" to check for opportunities</div>
                    </div>
                ) : (
                    signals.map((signal, index) => (
                        <div
                            key={`${signal.symbol}-${index}`}
                            onClick={() => onSignalClick?.(signal)}
                            className="p-3 bg-slate-700/30 hover:bg-slate-700/50 rounded-lg cursor-pointer transition-colors border border-slate-600/30"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-white">{signal.symbol}</span>
                                    <span className={`px-2 py-0.5 text-xs rounded-full ${getConfidenceColor(signal.confidence)}`}>
                                        {signal.confidence}%
                                    </span>
                                </div>
                                <span className="text-lg font-mono text-emerald-400">
                                    ₹{signal.price.toFixed(2)}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div className="flex items-center gap-1">
                                    <span className="text-slate-400">Target:</span>
                                    <span className="text-green-400 font-medium">
                                        ₹{signal.target.toFixed(2)}
                                    </span>
                                    <span className="text-green-500 text-xs">(+{signal.targetPercent}%)</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="text-slate-400">Stop:</span>
                                    <span className="text-red-400 font-medium">
                                        ₹{signal.stop.toFixed(2)}
                                    </span>
                                    <span className="text-red-500 text-xs">(-{signal.stopPercent}%)</span>
                                </div>
                            </div>

                            {signal.reason && (
                                <div className="mt-2 text-xs text-slate-400">
                                    📊 {signal.reason}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Start Scheduler - if signals exist */}
            {signals.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-600/30">
                    <button
                        onClick={async () => {
                            await fetch(`${apiBase}/api/signals/scheduler/start`, { method: 'POST' });
                            alert('Auto-scan started! Will run every 30 mins during market hours.');
                        }}
                        className="w-full py-2 text-sm bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg transition-colors"
                    >
                        ⏰ Enable Auto-Scan (Every 30 min)
                    </button>
                </div>
            )}
        </div>
    );
};

export default SignalsPanel;
