import { useState, useEffect } from 'react';

interface RiskExposure {
    totalTrades: number;
    totalCapital: number;
    totalRisk: number;
    byCategory: Record<string, { trades: number; capital: number; risk: number }>;
}

interface RiskLimits {
    maxRiskPerTrade: number;
    maxConcurrentTrades: number;
    maxCategoryExposure: number;
    maxDailyLoss: number;
    maxWeeklyLoss: number;
}

interface RiskMeterProps {
    activeTrades?: any[];
    totalCapital?: number;
    categoryKey?: string;
    className?: string;
}

export function RiskMeter({ activeTrades = [], totalCapital = 100000, categoryKey, className = '' }: RiskMeterProps) {
    const [exposure, setExposure] = useState<RiskExposure | null>(null);
    const [limits, setLimits] = useState<RiskLimits | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadRiskData();
    }, [activeTrades, categoryKey]);

    const loadRiskData = async () => {
        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';

            // Get risk limits
            const limitsResponse = categoryKey
                ? await fetch(`${apiBase}/api/risk/config/${categoryKey}`)
                : await fetch(`${apiBase}/api/risk/defaults`);
            const limitsData = await limitsResponse.json();

            setLimits(limitsData.config || limitsData.defaults);

            // Calculate exposure
            if (activeTrades.length > 0) {
                const exposureResponse = await fetch(`${apiBase}/api/risk/exposure`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        categoryKey,
                        activeTrades
                    })
                });

                const exposureData = await exposureResponse.json();
                setExposure(exposureData.exposure);
            } else {
                setExposure({
                    totalTrades: 0,
                    totalCapital: 0,
                    totalRisk: 0,
                    byCategory: {}
                });
            }
        } catch (error) {
            console.error('[RiskMeter] Error:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading || !limits) {
        return (
            <div className={`animate-pulse bg-slate-800 rounded-lg p-4 ${className}`}>
                <div className="h-4 bg-slate-700 rounded w-1/3"></div>
            </div>
        );
    }

    const exposurePercent = (exposure?.totalCapital || 0) / totalCapital * 100;
    const riskPercent = (exposure?.totalRisk || 0) / totalCapital * 100;
    const tradesUtilization = (exposure?.totalTrades || 0) / limits.maxConcurrentTrades * 100;

    const getStatusColor = (percent: number, limit: number) => {
        if (percent >= limit * 0.9) return 'red';
        if (percent >= limit * 0.7) return 'yellow';
        return 'green';
    };

    const exposureColor = getStatusColor(exposurePercent, limits.maxCategoryExposure);
    const tradesColor = getStatusColor(tradesUtilization, 100);
    const riskColor = getStatusColor(riskPercent, limits.maxRiskPerTrade);

    return (
        <div className={`bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 p-4 ${className}`}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-cyan-300 flex items-center">
                    <span className="mr-2">🛡️</span>
                    Risk Exposure
                </h3>
            </div>

            {/* Active Trades */}
            <div className="mb-4">
                <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">Active Trades</span>
                    <span className={`font-semibold ${tradesColor === 'red' ? 'text-red-400' :
                            tradesColor === 'yellow' ? 'text-yellow-400' :
                                'text-green-400'
                        }`}>
                        {exposure?.totalTrades || 0} / {limits.maxConcurrentTrades}
                    </span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                    <div
                        className={`h-2 rounded-full transition-all duration-300 ${tradesColor === 'red' ? 'bg-red-500' :
                                tradesColor === 'yellow' ? 'bg-yellow-500' :
                                    'bg-green-500'
                            }`}
                        style={{ width: `${Math.min(tradesUtilization, 100)}%` }}
                    />
                </div>
            </div>

            {/* Capital Exposure */}
            <div className="mb-4">
                <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">Capital Exposure</span>
                    <span className={`font-semibold ${exposureColor === 'red' ? 'text-red-400' :
                            exposureColor === 'yellow' ? 'text-yellow-400' :
                                'text-green-400'
                        }`}>
                        {exposurePercent.toFixed(1)}% / {limits.maxCategoryExposure}%
                    </span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                    <div
                        className={`h-2 rounded-full transition-all duration-300 ${exposureColor === 'red' ? 'bg-red-500' :
                                exposureColor === 'yellow' ? 'bg-yellow-500' :
                                    'bg-green-500'
                            }`}
                        style={{ width: `${Math.min(exposurePercent, 100)}%` }}
                    />
                </div>
            </div>

            {/* Total Risk */}
            <div className="bg-slate-800/60 rounded-lg p-2 border border-slate-700">
                <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400">Total at Risk</span>
                    <div className="text-right">
                        <div className="text-sm font-bold text-white">
                            ₹{(exposure?.totalRisk || 0).toLocaleString()}
                        </div>
                        <div className={`text-xs ${riskColor === 'red' ? 'text-red-400' :
                                riskColor === 'yellow' ? 'text-yellow-400' :
                                    'text-green-400'
                            }`}>
                            {riskPercent.toFixed(2)}% of capital
                        </div>
                    </div>
                </div>
            </div>

            {/* Warnings */}
            {(tradesUtilization >= 80 || exposurePercent >= limits.maxCategoryExposure * 0.8) && (
                <div className="mt-3 text-xs bg-yellow-500/20 border border-yellow-500 rounded px-2 py-1 text-yellow-300">
                    ⚠️ Approaching risk limits
                </div>
            )}
        </div>
    );
}
