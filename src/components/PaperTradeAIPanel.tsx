import { useState } from 'react';

interface PaperTradeAnalysis {
    symbol: string;
    findings: any[];
    suggestions: any[];
    avoidable: boolean;
    confidence: number;
}

interface PaperTradeAIPanelProps {
    failedTrades: any[];
    allCandles: Record<string, any[]>;
    className?: string;
}

export function PaperTradeAIPanel({ failedTrades, allCandles, className = '' }: PaperTradeAIPanelProps) {
    const [analysis, setAnalysis] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);

    const runAnalysis = async () => {
        setLoading(true);
        setAnalyzing(true);

        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
            const response = await fetch(`${apiBase}/api/paper-trade/analyze-failures`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ failedTrades, allCandles })
            });

            if (!response.ok) throw new Error(`API error: ${response.status}`);

            const data = await response.json();
            if (data.ok) {
                setAnalysis(data);
            }
        } catch (error) {
            console.error('[PaperTradeAI] Error:', error);
        } finally {
            setLoading(false);
            setAnalyzing(false);
        }
    };

    if (!failedTrades || failedTrades.length === 0) {
        return (
            <div className={`bg-slate-800 rounded-lg p-6 text-center text-gray-500 ${className}`}>
                No failed trades to analyze
            </div>
        );
    }

    if (!analysis) {
        return (
            <div className={`bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 p-6 ${className}`}>
                <div className="text-center">
                    <div className="text-4xl mb-3">🤖</div>
                    <h3 className="text-lg font-bold text-cyan-300 mb-2">Paper Trade AI Analysis</h3>
                    <p className="text-sm text-gray-400 mb-4">
                        Analyze {failedTrades.length} failed trade{failedTrades.length > 1 ? 's' : ''} to identify avoidable mistakes
                    </p>
                    <button
                        onClick={runAnalysis}
                        disabled={loading}
                        className={`px-6 py-2 rounded-lg font-semibold transition-colors ${loading
                                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-600 hover:to-blue-600'
                            }`}
                    >
                        {loading ? (
                            <span className="flex items-center">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                Analyzing...
                            </span>
                        ) : (
                            '🔍 Run AI Analysis'
                        )}
                    </button>
                </div>
            </div>
        );
    }

    const avoidablePercent = analysis.avoidablePercent || 0;
    const estimatedSavings = analysis.estimatedImprovement?.avoidableLossPercent || 0;

    return (
        <div className={`bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 p-6 ${className}`}>
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-cyan-300 flex items-center">
                    <span className="mr-2">🤖</span>
                    Paper Trade AI - Failure Analysis
                </h3>
                <button
                    onClick={runAnalysis}
                    className="text-xs bg-slate-700 hover:bg-slate-600 text-gray-300 px-3 py-1 rounded transition-colors"
                >
                    Re-analyze
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-800/60 rounded-lg p-3 border border-yellow-500/30">
                    <div className="text-xs text-gray-400 mb-1">Avoidable Trades</div>
                    <div className="text-2xl font-bold text-yellow-400">
                        {analysis.avoidableCount} / {analysis.totalAnalyzed}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                        {avoidablePercent.toFixed(0)}% could be avoided
                    </div>
                </div>

                <div className="bg-slate-800/60 rounded-lg p-3 border border-green-500/30">
                    <div className="text-xs text-gray-400 mb-1">Potential Savings</div>
                    <div className="text-2xl font-bold text-green-400">
                        +{estimatedSavings.toFixed(2)}%
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                        By applying suggestions
                    </div>
                </div>

                <div className="bg-slate-800/60 rounded-lg p-3 border border-cyan-500/30">
                    <div className="text-xs text-gray-400 mb-1">Confidence</div>
                    <div className="text-2xl font-bold text-cyan-400">
                        {Math.round((analysis.estimatedImprovement?.confidence || 0) * 100)}%
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                        AI confidence level
                    </div>
                </div>
            </div>

            {/* Top Suggestions */}
            <div className="mb-6">
                <h4 className="text-sm font-semibold text-gray-300 mb-3">
                    🎯 Top Recommendations
                </h4>
                <div className="space-y-3">
                    {analysis.topSuggestions?.slice(0, 5).map((sug: any, idx: number) => (
                        <div key={idx} className="bg-slate-800/60 rounded-lg p-4 border border-slate-700">
                            <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                    <div className="text-sm font-semibold text-cyan-300 mb-1">
                                        {sug.rule}
                                    </div>
                                    <div className="text-xs text-gray-400 mb-2">
                                        {sug.impact}
                                    </div>
                                </div>
                                <div className="text-right ml-4">
                                    <div className="text-xs text-gray-500">Frequency</div>
                                    <div className="text-sm font-bold text-yellow-400">
                                        {(sug.frequency * 100).toFixed(0)}%
                                    </div>
                                </div>
                            </div>
                            <div className="bg-slate-900/50 rounded px-3 py-2 font-mono text-xs text-green-400">
                                {sug.implementation}
                            </div>
                            <div className="mt-2 text-xs text-gray-500">
                                Avg Loss Avoided: <span className="text-green-400 font-semibold">{sug.avgLossAvoided.toFixed(2)}%</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Individual Analyses */}
            {analysis.analyses && analysis.analyses.length > 0 && (
                <div>
                    <h4 className="text-sm font-semibold text-gray-300 mb-3">
                        📋 Individual Trade Analysis ({analysis.analyses.length} trades)
                    </h4>
                    <div className="bg-slate-900/50 rounded-lg max-h-60 overflow-y-auto">
                        {analysis.analyses.slice(0, 10).map((tradeAnalysis: PaperTradeAnalysis, idx: number) => (
                            <div key={idx} className="p-3 border-b border-slate-700 last:border-b-0">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-semibold text-white">{tradeAnalysis.symbol}</span>
                                    {tradeAnalysis.avoidable && (
                                        <span className="text-xs bg-yellow-500/20 border border-yellow-500 rounded px-2 py-0.5 text-yellow-300">
                                            Avoidable ({Math.round(tradeAnalysis.confidence * 100)}%)
                                        </span>
                                    )}
                                </div>

                                {tradeAnalysis.findings.length > 0 && (
                                    <div className="space-y-1 text-xs">
                                        {tradeAnalysis.findings.map((finding: any, fidx: number) => (
                                            <div key={fidx} className="text-gray-400 flex items-start">
                                                <span className={`mr-1 ${finding.severity === 'HIGH' ? 'text-red-400' :
                                                        finding.severity === 'MEDIUM' ? 'text-yellow-400' :
                                                            'text-orange-400'
                                                    }`}>•</span>
                                                <span>
                                                    <strong className="text-gray-300">{finding.type}:</strong> {finding.description}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Action Button */}
            <div className="mt-6 pt-6 border-t border-slate-700 text-center">
                <button className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors">
                    ✨ Generate Improved Strategy (V2)
                </button>
                <div className="text-xs text-gray-500 mt-2">
                    Apply top suggestions to create an optimized version
                </div>
            </div>
        </div>
    );
}
