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
    confidence: string; // Changed from number to string (High/Medium/Low)
    qualityScore?: number;
    qualityFactors?: {
        marketTrend?: { value: string, score: number };
        stockRSI?: { value: number, score: number };
        prevDayClose?: { value: string, score: number };
    };
    warnings?: string[];
    reason?: string;
    timestamp: string;
}

interface SignalsPanelProps {
    categoryKey?: string;
    onSignalClick?: (signal: Signal) => void;
}

interface Settings {
    autoSkipLow: boolean;
    autoSkipAgainstTrend: boolean;
}

const SignalsPanel: React.FC<SignalsPanelProps> = ({
    categoryKey = 'DOWNSIDE_LOM_SWING',
    onSignalClick
}) => {
    const [signals, setSignals] = useState<Signal[]>([]);
    // const [loading, setLoading] = useState(false); // Removed unused state
    const [lastScan, setLastScan] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState<Settings>({ autoSkipLow: false, autoSkipAgainstTrend: false });

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

    const loadSettings = async () => {
        try {
            const response = await fetch(`${apiBase}/api/signals/settings`);
            const data = await response.json();
            if (data.ok && data.autoSkip) {
                setSettings(data.autoSkip);
            }
        } catch (err) {
            console.error('[Signals] Failed load settings:', err);
        }
    };

    const toggleSetting = async (key: keyof Settings) => {
        const newSettings = { ...settings, [key]: !settings[key] };
        setSettings(newSettings); // Optimistic update

        try {
            await fetch(`${apiBase}/api/signals/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSettings)
            });
        } catch (err) {
            console.error('[Signals] Failed save settings:', err);
            setSettings(settings); // Revert on error
        }
    };

    useEffect(() => {
        if (showSettings) loadSettings();
    }, [showSettings]);

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

    const getConfidenceColor = (confidence: string | number) => {
        // Handle legacy number format
        if (typeof confidence === 'number') {
            if (confidence >= 70) return 'text-green-400 bg-green-500/20 border border-green-500/30';
            if (confidence >= 50) return 'text-yellow-400 bg-yellow-500/20 border border-yellow-500/30';
            return 'text-red-400 bg-red-500/20 border border-red-500/30';
        }

        // Handle new string format
        const conf = confidence.toUpperCase();
        if (conf === 'HIGH') return 'text-green-400 bg-green-500/20 border border-green-500/30';
        if (conf === 'MEDIUM') return 'text-yellow-400 bg-yellow-500/20 border border-yellow-500/30';
        if (conf === 'LOW') return 'text-orange-400 bg-orange-500/20 border border-orange-500/30';
        return 'text-red-400 bg-red-500/20 border border-red-500/30'; // AVOID
    };

    const getWarningBadge = (warnings: string[]) => {
        if (!warnings || warnings.length === 0) return null;
        return (
            <div className="flex gap-1">
                {warnings.includes('AGAINST_TREND') && (
                    <span className="ml-2 px-2 py-0.5 text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/40 rounded uppercase">
                        ⚠️ Against Trend
                    </span>
                )}
                {warnings.includes('WEAK_MOMENTUM') && (
                    <span className="ml-2 px-2 py-0.5 text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/40 rounded uppercase">
                        ⚠️ Weak Momentum
                    </span>
                )}
            </div>
        );
    };

    // Sort signals by confidence: HIGH > MEDIUM > LOW > AVOID > UNKNOWN
    const sortedSignals = [...signals].sort((a, b) => {
        const priority: { [key: string]: number } = { 'HIGH': 4, 'MEDIUM': 3, 'LOW': 2, 'AVOID': 1, 'UNKNOWN': 0 };
        const scoreA = priority[String(a.confidence).toUpperCase()] || 0;
        const scoreB = priority[String(b.confidence).toUpperCase()] || 0;
        return scoreB - scoreA;
    });

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
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-2 transition-colors ${showSettings ? 'bg-slate-700 text-white' : 'bg-slate-700/50 hover:bg-slate-600/50 text-slate-300'}`}
                        title="Configure Auto-Skip Filters"
                    >
                        ⚙️
                    </button>
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
            </div>

            {/* Settings Panel */}
            {showSettings && (
                <div className="mb-4 p-3 bg-slate-800 rounded-lg border border-slate-700 shadow-lg">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="text-sm font-semibold text-white">🛡️ Hybrid Filter Settings</h4>
                        <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white">✕</button>
                    </div>
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-700/50 transition-colors">
                            <input
                                type="checkbox"
                                checked={settings.autoSkipAgainstTrend}
                                onChange={() => toggleSetting('autoSkipAgainstTrend')}
                                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-600 focus:ring-cyan-500"
                            />
                            <div className="flex-1">
                                <span className="text-sm text-slate-200 block">Auto-Skip "Against Trend"</span>
                                <span className="text-xs text-slate-400">Skip signals if Nifty trend opposes trade (Prevents ~33% WR trades)</span>
                            </div>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-700/50 transition-colors">
                            <input
                                type="checkbox"
                                checked={settings.autoSkipLow}
                                onChange={() => toggleSetting('autoSkipLow')}
                                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-600 focus:ring-cyan-500"
                            />
                            <div className="flex-1">
                                <span className="text-sm text-slate-200 block">Auto-Skip "Low Confidence"</span>
                                <span className="text-xs text-slate-400">Skip any signals with neutral/mixed factors</span>
                            </div>
                        </label>
                    </div>
                </div>
            )}

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
                {sortedSignals.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                        <div className="text-3xl mb-2">🔎</div>
                        <div>No active signals</div>
                        <div className="text-sm mt-1">Click "Scan Now" to check for opportunities</div>
                    </div>
                ) : (
                    sortedSignals.map((signal, index) => (
                        <div
                            key={`${signal.symbol}-${index}`}
                            onClick={() => onSignalClick?.(signal)}
                            className="p-3 bg-slate-700/30 hover:bg-slate-700/50 rounded-lg cursor-pointer transition-colors border border-slate-600/30"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-white">{signal.symbol}</span>
                                    {/* Confidence Badge */}
                                    <span className={`px-2 py-0.5 text-xs rounded font-semibold ${getConfidenceColor(signal.confidence)}`}>
                                        {typeof signal.confidence === 'number' ? `${signal.confidence}%` : signal.confidence}
                                    </span>
                                    {/* Quality Score Badge (if exists) */}
                                    {signal.qualityScore !== undefined && (
                                        <span className={`px-2 py-0.5 text-[10px] rounded font-mono ${signal.qualityScore > 0 ? 'text-green-400 bg-green-900/30' : 'text-slate-400 bg-slate-800'}`}>
                                            QS: {signal.qualityScore > 0 ? '+' : ''}{signal.qualityScore}
                                        </span>
                                    )}
                                    {/* Warnings */}
                                    {getWarningBadge(signal.warnings || [])}
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

                            {/* Signal Reason / Quality Factors */}
                            <div className="mt-2 text-xs flex flex-wrap gap-2">
                                {signal.qualityFactors?.marketTrend && (
                                    <span className={signal.qualityFactors.marketTrend.score > 0 ? 'text-green-400' : 'text-red-400'}>
                                        {signal.qualityFactors.marketTrend.score > 0 ? '📈' : '📉'} Nifty {signal.qualityFactors.marketTrend.value}
                                    </span>
                                )}
                                {signal.qualityFactors?.stockRSI && (
                                    <span className="text-slate-400">
                                        💪 RSI {signal.qualityFactors.stockRSI.value}
                                    </span>
                                )}
                            </div>
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
