import React, { useEffect, useState } from 'react';
import { getMarketSentiment, detectMarketRegime, type MarketSentiment, type MarketRegime } from '../api';

const MarketIntelligenceWidget: React.FC = () => {
    const [sentiment, setSentiment] = useState<MarketSentiment | null>(null);
    const [regime, setRegime] = useState<MarketRegime | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

    useEffect(() => {
        loadData();
        // Auto-refresh every 15 minutes
        const interval = setInterval(loadData, 15 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const loadData = async () => {
        try {
            const [sentimentData, regimeData] = await Promise.all([
                getMarketSentiment(),
                detectMarketRegime([]) // TODO: Pass actual Nifty candles when available
            ]);
            setSentiment(sentimentData);
            setRegime(regimeData);
            setLastUpdate(new Date());
        } catch (error) {
            console.error('Failed to load market intelligence:', error);
        } finally {
            setLoading(false);
        }
    };

    const getSentimentColor = (score: number) => {
        if (score > 0.3) return 'text-green-400';
        if (score < -0.3) return 'text-red-400';
        return 'text-yellow-400';
    };

    const getSentimentBg = (score: number) => {
        if (score > 0.3) return 'bg-green-500/10 border-green-500/30';
        if (score < -0.3) return 'bg-red-500/10 border-red-500/30';
        return 'bg-yellow-500/10 border-yellow-500/30';
    };

    const getRegimeColor = (regime: string) => {
        if (regime === 'TRENDING_BULLISH') return 'text-green-400';
        if (regime === 'TRENDING_BEARISH') return 'text-red-400';
        if (regime === 'VOLATILE') return 'text-orange-400';
        return 'text-blue-400';
    };

    const getRegimeIcon = (regime: string) => {
        if (regime === 'TRENDING_BULLISH') return '📈';
        if (regime === 'TRENDING_BEARISH') return '📉';
        if (regime === 'VOLATILE') return '⚡';
        return '↔️';
    };

    if (loading) {
        return (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-center">
                    <div className="animate-spin h-5 w-5 border-2 border-cyan-500 border-t-transparent rounded-full"></div>
                    <span className="ml-2 text-sm text-slate-400">Loading...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center">
                    <svg className="w-4 h-4 mr-1.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Market Intelligence
                </h3>
                <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-500">
                        {lastUpdate.toLocaleTimeString()}
                    </span>
                    <button
                        onClick={loadData}
                        className="text-xs text-slate-400 hover:text-cyan-400 transition-colors"
                        title="Refresh"
                    >
                        ↻
                    </button>
                </div>
            </div>

            {/* Sentiment */}
            {sentiment && (
                <div className={`p-3 rounded border ${getSentimentBg(sentiment.score)}`}>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-slate-400">Sentiment</span>
                        <span className={`text-sm font-bold ${getSentimentColor(sentiment.score)}`}>
                            {sentiment.label}
                        </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                        <div className="text-center">
                            <div className="text-slate-400">FII/DII</div>
                            <div className={`font-semibold ${sentiment.components.fiiDii.netFlow > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {sentiment.components.fiiDii.netFlow > 0 ? '+' : ''}{sentiment.components.fiiDii.netFlow}
                            </div>
                        </div>
                        <div className="text-center">
                            <div className="text-slate-400">VIX</div>
                            <div className="font-semibold text-slate-200">{sentiment.components.vix.value.toFixed(1)}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-slate-400">PCR</div>
                            <div className="font-semibold text-slate-200">{sentiment.components.pcr.value.toFixed(2)}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-slate-400">Global</div>
                            <div className={`font-semibold ${sentiment.components.globalCues === 'POSITIVE' ? 'text-green-400' : sentiment.components.globalCues === 'NEGATIVE' ? 'text-red-400' : 'text-yellow-400'}`}>
                                {sentiment.components.globalCues === 'POSITIVE' ? '✓' : sentiment.components.globalCues === 'NEGATIVE' ? '✗' : '−'}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Regime */}
            {regime && (
                <div className="p-3 rounded border border-slate-600 bg-slate-900/30">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Market Regime</span>
                        <div className="flex items-center space-x-1">
                            <span className="text-sm">{getRegimeIcon(regime.regime)}</span>
                            <span className={`text-sm font-bold ${getRegimeColor(regime.regime)}`}>
                                {regime.regime.replace('_', ' ')}
                            </span>
                        </div>
                    </div>
                    {regime.reason && (
                        <div className="mt-1 text-xs text-slate-400 italic">
                            {regime.reason}
                        </div>
                    )}
                </div>
            )}

            {!sentiment && !regime && (
                <div className="text-center text-xs text-slate-500 py-2">
                    Market data unavailable
                </div>
            )}
        </div>
    );
};

export default MarketIntelligenceWidget;
