import { useState, useEffect } from 'react';

interface RegimeStatus {
    regime: 'TRENDING_BULLISH' | 'TRENDING_BEARISH' | 'VOLATILE' | 'RANGING' | 'UNKNOWN';
    confidence: number;
    allowed: boolean;
    reason: string;
}

interface RegimeStatusIndicatorProps {
    categoryKey?: string;
    compact?: boolean;
    className?: string;
}

export function RegimeStatusIndicator({ categoryKey, compact = false, className = '' }: RegimeStatusIndicatorProps) {
    const [regime, setRegime] = useState<RegimeStatus | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadRegimeStatus();
        const interval = setInterval(loadRegimeStatus, 5 * 60 * 1000); // Refresh every 5 min
        return () => clearInterval(interval);
    }, [categoryKey]);

    const loadRegimeStatus = async () => {
        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';

            // Get current regime
            const regimeResponse = await fetch(`${apiBase}/api/regime/current`);
            const regimeData = await regimeResponse.json();

            if (!regimeData.ok || !regimeData.regime) {
                setRegime(null);
                return;
            }

            // Check if trading allowed
            if (categoryKey) {
                const allowedResponse = await fetch(`${apiBase}/api/regime/should-trade`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        symbol: 'INDEX',
                        direction: 'BUY',
                        categoryKey
                    })
                });

                const allowedData = await allowedResponse.json();

                setRegime({
                    regime: regimeData.regime.regime,
                    confidence: regimeData.regime.confidence,
                    allowed: allowedData.allowed || false,
                    reason: allowedData.reason || 'Unknown'
                });
            } else {
                setRegime({
                    regime: regimeData.regime.regime,
                    confidence: regimeData.regime.confidence,
                    allowed: true,
                    reason: 'No category specified'
                });
            }
        } catch (error) {
            console.error('[RegimeStatus] Error:', error);
            setRegime(null);
        } finally {
            setLoading(false);
        }
    };

    if (loading || !regime) {
        return compact ? (
            <span className={`text-xs text-gray-500 ${className}`}>Loading...</span>
        ) : null;
    }

    const regimeConfig = {
        TRENDING_BULLISH: { color: 'green', icon: '📈', label: 'Bullish', bg: 'bg-green-500/20', border: 'border-green-500', text: 'text-green-300' },
        TRENDING_BEARISH: { color: 'red', icon: '📉', label: 'Bearish', bg: 'bg-red-500/20', border: 'border-red-500', text: 'text-red-300' },
        VOLATILE: { color: 'yellow', icon: '⚡', label: 'Volatile', bg: 'bg-yellow-500/20', border: 'border-yellow-500', text: 'text-yellow-300' },
        RANGING: { color: 'blue', icon: '↔️', label: 'Ranging', bg: 'bg-blue-500/20', border: 'border-blue-500', text: 'text-blue-300' },
        UNKNOWN: { color: 'gray', icon: '❓', label: 'Unknown', bg: 'bg-gray-500/20', border: 'border-gray-500', text: 'text-gray-300' }
    };

    const config = regimeConfig[regime.regime] || regimeConfig.UNKNOWN;
    const confidence = Math.round(regime.confidence * 100);

    // Compact version (inline badge)
    if (compact) {
        return (
            <span className={`inline-flex items-center ${config.bg} border ${config.border} rounded px-2 py-1 text-xs ${config.text} ${className}`}
                title={`${regime.reason} (${confidence}% confidence)`}>
                <span className="mr-1">{config.icon}</span>
                {config.label}
                {!regime.allowed && <span className="ml-1 text-red-400">🚫</span>}
            </span>
        );
    }

    // Full version (card)
    return (
        <div className={`rounded-lg border ${config.border} ${config.bg} p-3 ${className}`}>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                    <span className="text-2xl mr-2">{config.icon}</span>
                    <div>
                        <div className={`text-sm font-semibold ${config.text}`}>{config.label} Regime</div>
                        <div className="text-xs text-gray-400">{confidence}% confidence</div>
                    </div>
                </div>
                {!regime.allowed && (
                    <div className="text-red-400 text-xl" title="Trading not recommended">
                        🚫
                    </div>
                )}
            </div>

            <div className="text-xs text-gray-300 mt-2">
                {regime.reason}
            </div>

            {!regime.allowed && (
                <div className="mt-2 text-xs text-red-400 bg-red-900/30 rounded px-2 py-1">
                    ⚠️ Entries may be blocked in this regime
                </div>
            )}
        </div>
    );
}
