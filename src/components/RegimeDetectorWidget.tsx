import { useState, useEffect } from 'react';
import { SparklesIcon } from './icons/SparklesIcon';
import { SpinnerIcon } from './icons/SpinnerIcon';

type RegimeType = 'TRENDING_BULLISH' | 'TRENDING_BEARISH' | 'VOLATILE' | 'RANGING' | 'UNKNOWN';

interface RegimeData {
    regime: RegimeType;
    confidence: number;
    details: {
        volatility: number;
        trendStrength: number;
    };
}

export function RegimeDetectorWidget({ className = '' }: { className?: string }) {
    const [regimeData, setRegimeData] = useState<RegimeData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        detectRegime();
        const interval = setInterval(detectRegime, 5 * 60 * 1000); // 5 minutes
        return () => clearInterval(interval);
    }, []);

    const detectRegime = async () => {
        setLoading(true);
        setError(null);

        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
            const response = await fetch(`${apiBase}/api/ai/detect-regime`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ candles: generateMockCandles() })
            });

            if (!response.ok) throw new Error(`API error: ${response.status}`);

            const data = await response.json();
            if (data.ok && data.regime) {
                setRegimeData(data.regime);
            } else {
                throw new Error(data.error || 'Unknown error');
            }
        } catch (err: any) {
            console.error('[Regime Detector] Error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading && !regimeData) {
        return (
            <div className={`p-4 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 ${className}`}>
                <div className="flex items-center justify-center py-4">
                    <SpinnerIcon className="w-6 h-6 text-cyan-400 animate-spin" />
                    <span className="ml-2 text-sm text-slate-400">Analyzing...</span>
                </div>
            </div>
        );
    }

    if (error && !regimeData) {
        return (
            <div className={`p-4 rounded-xl bg-gradient-to-br from-red-900/30 to-slate-900 border border-red-700/50 ${className}`}>
                <div className="text-center text-sm">
                    <div className="text-red-400 font-semibold mb-1">⚠️ Error</div>
                    <div className="text-xs text-slate-400">{error}</div>
                </div>
            </div>
        );
    }

    if (!regimeData) return null;

    const regimeConfig = {
        TRENDING_BULLISH: { color: 'from-green-500 to-emerald-600', icon: '📈', label: 'Bullish' },
        TRENDING_BEARISH: { color: 'from-red-500 to-rose-600', icon: '📉', label: 'Bearish' },
        VOLATILE: { color: 'from-yellow-500 to-amber-600', icon: '⚡', label: 'Volatile' },
        RANGING: { color: 'from-blue-500 to-cyan-600', icon: '↔️', label: 'Ranging' },
        UNKNOWN: { color: 'from-slate-500 to-slate-600', icon: '❓', label: 'Unknown' }
    };

    const config = regimeConfig[regimeData.regime] || regimeConfig.UNKNOWN;
    const confidence = Math.round(regimeData.confidence * 100);

    return (
        <div className={`p-4 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-cyan-500/40 ${className}`}>
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold flex items-center text-cyan-300">
                    <SparklesIcon className="w-4 h-4 mr-1" />
                    Market Regime
                </h3>
                {loading && <SpinnerIcon className="w-4 h-4 text-cyan-400 animate-spin" />}
            </div>

            <div className={`bg-gradient-to-br ${config.color} rounded-lg p-3 text-white text-center mb-3`}>
                <div className="text-2xl mb-1">{config.icon}</div>
                <div className="text-sm font-semibold">{config.label}</div>
            </div>

            <div className="bg-slate-800/60 rounded-lg p-2 border border-slate-700">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-slate-400">Confidence</span>
                    <span className="text-sm font-bold text-white">{confidence}%</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                    <div
                        className={`${confidence > 70 ? 'bg-green-500' : confidence > 50 ? 'bg-yellow-500' : 'bg-red-500'} h-2 rounded-full transition-all duration-500`}
                        style={{ width: `${confidence}%` }}
                    />
                </div>
            </div>

            <button
                onClick={detectRegime}
                className="mt-2 w-full text-xs text-cyan-400 hover:text-cyan-300 transition"
                disabled={loading}
            >
                {loading ? 'Refreshing...' : '🔄 Refresh'}
            </button>
        </div>
    );
}

// Mock candle generator for testing
function generateMockCandles(): any[] {
    const candles = [];
    let price = 100;
    for (let i = 0; i < 100; i++) {
        const change = (Math.random() - 0.48) * 2;
        price += change;
        candles.push({
            timestamp: Date.now() - (100 - i) * 60000,
            open: price,
            high: price + Math.random(),
            low: price - Math.random(),
            close: price,
            volume: Math.floor(Math.random() * 1000000)
        });
    }
    return candles;
}
