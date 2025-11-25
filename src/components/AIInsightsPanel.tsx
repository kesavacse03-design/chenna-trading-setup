import React, { useEffect, useState } from 'react';
import { getMarketSentiment, detectMarketRegime, getAITokenUsage, type MarketSentiment, type MarketRegime, type TokenUsageStats } from '../api';

// AIInsightsPanel shows global market intelligence

const AIInsightsPanel: React.FC = () => {
    const [sentiment, setSentiment] = useState<MarketSentiment | null>(null);
    const [regime, setRegime] = useState<MarketRegime | null>(null);
    const [tokenUsage, setTokenUsage] = useState<TokenUsageStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadInsights();
    }, []);

    const loadInsights = async () => {
        setLoading(true);
        try {
            const [sentimentData, regimeData, usage] = await Promise.all([
                getMarketSentiment(),
                detectMarketRegime([]), // Pass empty array - backend will use latest data
                getAITokenUsage()
            ]);
            setSentiment(sentimentData);
            setRegime(regimeData);
            setTokenUsage(usage);
        } catch (error) {
            console.error('Failed to load AI insights:', error);
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
        if (score > 0.3) return 'bg-green-500/20 border-green-500/50';
        if (score < -0.3) return 'bg-red-500/20 border-red-500/50';
        return 'bg-yellow-500/20 border-yellow-500/50';
    };

    if (loading) {
        return (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                <div className="flex items-center justify-center py-4">
                    <div className="animate-spin h-6 w-6 border-2 border-cyan-500 border-t-transparent rounded-full"></div>
                    <span className="ml-2 text-sm text-slate-400">Loading AI Insights...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Market Sentiment Card */}
            {sentiment && (
                <div className={`p-4 rounded-lg border ${getSentimentBg(sentiment.score)}`}>
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-slate-200 flex items-center">
                            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Market Sentiment
                        </h3>
                        <button
                            onClick={loadInsights}
                            className="text-xs text-slate-400 hover:text-cyan-400 transition-colors"
                            title="Refresh"
                        >
                            ↻
                        </button>
                    </div>

                    <div className="flex items-baseline space-x-2 mb-3">
                        <span className={`text-2xl font-bold ${getSentimentColor(sentiment.score)}`}>
                            {sentiment.label}
                        </span>
                        <span className="text-sm text-slate-400">
                            ({sentiment.score > 0 ? '+' : ''}{(sentiment.score * 100).toFixed(0)}%)
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-slate-900/50 p-2 rounded">
                            <div className="text-slate-400">FII/DII</div>
                            <div className={`font-semibold ${sentiment.components.fiiDii.netFlow > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                ₹{sentiment.components.fiiDii.netFlow}Cr
                            </div>
                        </div>
                        <div className="bg-slate-900/50 p-2 rounded">
                            <div className="text-slate-400">VIX</div>
                            <div className="font-semibold text-slate-200">
                                {sentiment.components.vix.value.toFixed(1)} <span className="text-xs text-slate-400">({sentiment.components.vix.trend})</span>
                            </div>
                        </div>
                        <div className="bg-slate-900/50 p-2 rounded">
                            <div className="text-slate-400">PCR</div>
                            <div className="font-semibold text-slate-200">
                                {sentiment.components.pcr.value.toFixed(2)}
                            </div>
                        </div>
                        <div className="bg-slate-900/50 p-2 rounded">
                            <div className="text-slate-400">Global</div>
                            <div className={`font-semibold ${sentiment.components.globalCues === 'POSITIVE' ? 'text-green-400' : sentiment.components.globalCues === 'NEGATIVE' ? 'text-red-400' : 'text-yellow-400'}`}>
                                {sentiment.components.globalCues}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Market Regime Card */}
            {regime && (
                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-600">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-slate-200 flex items-center">
                            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                            </svg>
                            Market Regime
                        </h3>
                    </div>

                    <div className="flex items-baseline space-x-2 mb-2">
                        <span className={`text-xl font-bold ${regime.regime.includes('BULLISH') ? 'text-green-400' :
                                regime.regime.includes('BEARISH') ? 'text-red-400' :
                                    'text-yellow-400'
                            }`}>
                            {regime.regime.replace(/_/g, ' ')}
                        </span>
                    </div>

                    <div className="text-xs text-slate-400">
                        Confidence: {(regime.confidence * 100).toFixed(0)}%
                    </div>
                </div>
            )}

            {/* AI Token Usage Card */}
            {tokenUsage && (
                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-600">
                    <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center">
                        <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        AI Token Usage
                    </h3>

                    <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                        <div>
                            <div className="text-slate-400">Total Cost</div>
                            <div className="text-lg font-bold text-cyan-400">
                                ${tokenUsage.totalCost.toFixed(4)}
                            </div>
                        </div>
                        <div>
                            <div className="text-slate-400">Tokens Used</div>
                            <div className="text-lg font-bold text-slate-200">
                                {tokenUsage.totalTokensUsed.toLocaleString()}
                            </div>
                        </div>
                        <div>
                            <div className="text-slate-400">Requests</div>
                            <div className="font-semibold text-slate-200">{tokenUsage.requestCount}</div>
                        </div>
                        <div>
                            <div className="text-slate-400">Avg Cost</div>
                            <div className="font-semibold text-slate-200">${tokenUsage.avgCostPerRequest.toFixed(4)}</div>
                        </div>
                    </div>

                    {tokenUsage.totalCost > 5 && (
                        <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs text-yellow-400">
                            ⚠️ Cost exceeded $5. Consider optimizing.
                        </div>
                    )}
                </div>
            )}

            {!sentiment && !regime && !tokenUsage && (
                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 text-center text-sm text-slate-400">
                    AI insights unavailable. Check backend connection.
                </div>
            )}
        </div>
    );
};

export default AIInsightsPanel;
