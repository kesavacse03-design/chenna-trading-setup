import React, { useState } from 'react';

interface ResearchBacktestModalProps {
    isOpen: boolean;
    onClose: () => void;
    categoryKey: string;
}

interface IterationResult {
    iteration: number;
    trades: number;
    wins: number;
    losses: number;
    winRate: string;
    avgPnl: string;
    filters: string[];
}

interface TradeDetail {
    symbol: string;
    entryDate: string;
    entryPrice: string;
    exitDate: string;
    exitPrice: string;
    exitReason: string;
    outcome: string;
    daysHeld: number;
    pnlPercent: string;
}

interface BacktestResult {
    category: string;
    strategy: { patterns: string[] };
    iterations: IterationResult[];
    improvements: string[];
    learningLog: string[];
    finalResult: {
        trades: number;
        wins: number;
        losses: number;
        winRate: string;
        avgPnl: string;
        totalPnl: string;
        tradeDetails: TradeDetail[];
    } | null;
}

export const ResearchBacktestModal: React.FC<ResearchBacktestModalProps> = ({
    isOpen,
    onClose,
    categoryKey
}) => {
    const [isRunning, setIsRunning] = useState(false);
    const [result, setResult] = useState<BacktestResult | null>(null);
    const [selectedPattern, setSelectedPattern] = useState('VolumeSpike');
    const [maxIterations, setMaxIterations] = useState(5);
    const [logs, setLogs] = useState<string[]>([]);

    const patterns = [
        { value: 'VolumeSpike', label: 'VolumeSpike', winRate: '77.8%' },
        { value: 'RSI_Oversold', label: 'RSI_Oversold', winRate: '71.4%' },
        { value: 'Stoch_Oversold', label: 'Stoch_Oversold', winRate: '62.1%' },
        { value: 'StrongClose', label: 'StrongClose', winRate: '62.5%' },
        { value: 'HigherLow', label: 'HigherLow', winRate: '55.0%' },
        { value: 'MACD_BullishCross', label: 'MACD_BullishCross', winRate: '52.0%' }
    ];

    const handleRunBacktest = async () => {
        setIsRunning(true);
        setResult(null);
        setLogs([
            '🧠 INTELLIGENT SELF-LEARNING BACKTEST',
            '══════════════════════════════════════════',
            '',
            `📌 Category: ${categoryKey}`,
            `📌 Pattern: ${selectedPattern}`,
            `📌 Max Iterations: ${maxIterations}`,
            '',
            '📦 Loading stocks and historical data...'
        ]);

        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
            const response = await fetch(`${apiBase}/api/labs/intelligent-backtest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categoryKey,
                    patterns: [selectedPattern],
                    maxIterations,
                    targetWinRate: 65
                })
            });

            const data = await response.json();
            if (!data.ok) throw new Error(data.error || 'Backtest failed');

            setResult(data.result);

            // Build learning log
            const logLines = [
                '',
                '✅ BACKTEST COMPLETE!',
                '',
                '📊 ITERATION PROGRESS:'
            ];

            data.result.iterations?.forEach((iter: IterationResult) => {
                logLines.push(`   Iteration ${iter.iteration}: ${iter.winRate} win rate, ${iter.avgPnl} avg PnL`);
                if (iter.filters?.length > 0) {
                    logLines.push(`   └─ Applied: ${iter.filters.join(', ')}`);
                }
            });

            logLines.push('');
            logLines.push('🎓 IMPROVEMENTS LEARNED:');
            (data.result.improvements || []).forEach((imp: string) => {
                logLines.push(`   ✓ ${imp}`);
            });

            setLogs(prev => [...prev, ...logLines]);

        } catch (err: any) {
            setLogs(prev => [...prev, '', `❌ Error: ${err.message}`]);
        } finally {
            setIsRunning(false);
        }
    };

    if (!isOpen) return null;

    const firstIter = result?.iterations?.[0];
    const lastIter = result?.iterations?.[result.iterations.length - 1];

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6">
            <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-emerald-500/30 bg-gradient-to-r from-emerald-900/30 to-transparent">
                    <div>
                        <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 flex items-center gap-2">
                            🧠 Intelligent Self-Learning Backtest
                        </h2>
                        <p className="text-xs text-slate-400 mt-1">
                            {categoryKey.replace(/_/g, ' ')} • Learn → Improve → Repeat
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
                </div>

                {/* Controls */}
                <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/50 flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <label className="text-slate-400 text-sm">Pattern:</label>
                        <select
                            value={selectedPattern}
                            onChange={(e) => setSelectedPattern(e.target.value)}
                            className="bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white text-sm"
                        >
                            {patterns.map(p => (
                                <option key={p.value} value={p.value}>
                                    {p.label} ({p.winRate})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-slate-400 text-sm">Max Iterations:</label>
                        <input
                            type="number"
                            value={maxIterations}
                            onChange={(e) => setMaxIterations(Math.max(1, Math.min(10, parseInt(e.target.value) || 5)))}
                            min={1}
                            max={10}
                            className="w-16 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm text-center"
                        />
                    </div>

                    <div className="flex-1" />

                    <button
                        onClick={handleRunBacktest}
                        disabled={isRunning}
                        className="px-8 py-2.5 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold rounded-lg disabled:opacity-50 transition shadow-lg"
                    >
                        {isRunning ? '⏳ Learning...' : '▶ Run Intelligent Backtest'}
                    </button>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left: Results */}
                    <div className="flex-1 p-6 overflow-y-auto">
                        {result?.finalResult ? (
                            <div className="space-y-6">
                                {/* Before/After Comparison */}
                                <div className="grid grid-cols-2 gap-6">
                                    {/* BEFORE Card */}
                                    <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-600">
                                        <h3 className="text-sm font-semibold text-slate-400 mb-4 flex items-center gap-2">
                                            📋 BEFORE <span className="text-xs bg-slate-700 px-2 py-0.5 rounded">Iteration 1</span>
                                        </h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-slate-900/50 rounded-lg p-4 text-center">
                                                <div className="text-3xl font-bold text-white">{firstIter?.trades || 0}</div>
                                                <div className="text-xs text-slate-500 mt-1">Trades</div>
                                            </div>
                                            <div className="bg-slate-900/50 rounded-lg p-4 text-center">
                                                <div className="text-3xl font-bold text-white">{firstIter?.winRate || '0%'}</div>
                                                <div className="text-xs text-slate-500 mt-1">Win Rate</div>
                                            </div>
                                            <div className="bg-slate-900/50 rounded-lg p-4 text-center col-span-2">
                                                <div className="text-2xl font-bold text-white">{firstIter?.avgPnl || '0%'}</div>
                                                <div className="text-xs text-slate-500 mt-1">Avg PnL</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* AFTER Card */}
                                    <div className="bg-emerald-900/30 rounded-xl p-5 border border-emerald-500/30">
                                        <h3 className="text-sm font-semibold text-emerald-300 mb-4 flex items-center gap-2">
                                            ✅ AFTER <span className="text-xs bg-emerald-700/50 px-2 py-0.5 rounded">Iteration {lastIter?.iteration || result.iterations?.length}</span>
                                        </h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-slate-900/50 rounded-lg p-4 text-center">
                                                <div className="text-3xl font-bold text-emerald-400">{result.finalResult.trades}</div>
                                                <div className="text-xs text-emerald-400/70 mt-1">Trades</div>
                                            </div>
                                            <div className="bg-slate-900/50 rounded-lg p-4 text-center">
                                                <div className="text-3xl font-bold text-emerald-400">{result.finalResult.winRate}</div>
                                                <div className="text-xs text-emerald-400/70 mt-1">Win Rate</div>
                                            </div>
                                            <div className="bg-slate-900/50 rounded-lg p-4 text-center">
                                                <div className="text-2xl font-bold text-emerald-400">{result.finalResult.avgPnl}</div>
                                                <div className="text-xs text-emerald-400/70 mt-1">Avg PnL</div>
                                            </div>
                                            <div className="bg-slate-900/50 rounded-lg p-4 text-center">
                                                <div className="text-2xl font-bold text-emerald-400">{result.finalResult.totalPnl}</div>
                                                <div className="text-xs text-emerald-400/70 mt-1">Total PnL</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Improvements Learned */}
                                {result.improvements?.length > 0 && (
                                    <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-600">
                                        <h4 className="text-sm font-semibold text-cyan-400 mb-3">🎓 Logic Improvements Learned</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {result.improvements.map((imp, i) => (
                                                <span key={i} className="px-4 py-2 bg-cyan-900/40 border border-cyan-500/30 rounded-full text-sm text-cyan-300 flex items-center gap-2">
                                                    <span className="text-green-400">✓</span> {imp}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Iteration Timeline */}
                                {result.iterations?.length > 1 && (
                                    <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-600">
                                        <h4 className="text-sm font-semibold text-purple-400 mb-3">📈 Learning Progress</h4>
                                        <div className="flex items-center gap-2 overflow-x-auto pb-2">
                                            {result.iterations.map((iter, i) => (
                                                <div key={i} className="flex items-center">
                                                    <div className={`px-4 py-2 rounded-lg text-center min-w-[80px] ${i === result.iterations.length - 1 ? 'bg-emerald-900/50 border border-emerald-500/30' : 'bg-slate-700'}`}>
                                                        <div className="text-xs text-slate-400">Iter {iter.iteration}</div>
                                                        <div className={`text-lg font-bold ${i === result.iterations.length - 1 ? 'text-emerald-400' : 'text-white'}`}>
                                                            {iter.winRate}
                                                        </div>
                                                    </div>
                                                    {i < result.iterations.length - 1 && (
                                                        <span className="text-slate-500 mx-2">→</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Trade Details Table */}
                                {result.finalResult.tradeDetails?.length > 0 && (
                                    <div className="bg-slate-800/50 rounded-xl border border-slate-600 overflow-hidden">
                                        <h4 className="px-5 py-3 text-sm font-semibold text-white border-b border-slate-600 bg-slate-700/50">
                                            📊 Trade Details ({result.finalResult.tradeDetails.length} trades)
                                        </h4>
                                        <div className="max-h-72 overflow-y-auto">
                                            <table className="w-full text-sm">
                                                <thead className="bg-slate-700/80 sticky top-0">
                                                    <tr>
                                                        <th className="px-4 py-2 text-left text-slate-300 font-medium">Symbol</th>
                                                        <th className="px-4 py-2 text-left text-slate-300 font-medium">Entry Date</th>
                                                        <th className="px-4 py-2 text-right text-slate-300 font-medium">Entry ₹</th>
                                                        <th className="px-4 py-2 text-center text-slate-300 font-medium">Exit Reason</th>
                                                        <th className="px-4 py-2 text-center text-slate-300 font-medium">Days</th>
                                                        <th className="px-4 py-2 text-right text-slate-300 font-medium">PnL</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {result.finalResult.tradeDetails.map((trade, i) => (
                                                        <tr key={i} className={`border-b border-slate-700/50 ${trade.outcome === 'WIN' ? 'bg-green-900/10' : 'bg-red-900/10'}`}>
                                                            <td className="px-4 py-2.5 text-white font-medium">{trade.symbol}</td>
                                                            <td className="px-4 py-2.5 text-slate-400">{trade.entryDate?.slice(0, 10)}</td>
                                                            <td className="px-4 py-2.5 text-right text-slate-300">₹{trade.entryPrice}</td>
                                                            <td className="px-4 py-2.5 text-center">
                                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${trade.exitReason === 'TARGET_HIT' ? 'bg-green-600 text-white' :
                                                                    trade.exitReason === 'STOP_HIT' ? 'bg-red-600 text-white' :
                                                                        'bg-slate-600 text-slate-200'
                                                                    }`}>
                                                                    {trade.exitReason}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-2.5 text-center text-slate-400">{trade.daysHeld}</td>
                                                            <td className={`px-4 py-2.5 text-right font-bold ${trade.outcome === 'WIN' ? 'text-green-400' : 'text-red-400'}`}>
                                                                {trade.pnlPercent}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                <div className="text-7xl mb-6 opacity-30">🧠</div>
                                <p className="text-xl mb-2">Intelligent Self-Learning Backtest</p>
                                <p className="text-sm text-slate-500 text-center max-w-md">
                                    Select a pattern and click "Run Intelligent Backtest".<br />
                                    The system will learn from failures and iteratively improve.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Right: Activity Log */}
                    <div className="w-72 border-l border-slate-800 flex flex-col bg-slate-800/30">
                        <div className="px-4 py-3 border-b border-slate-800 bg-slate-800/50">
                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Activity Log</h3>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto">
                            <div className="space-y-1 text-xs font-mono text-slate-400">
                                {logs.map((log, i) => (
                                    <div
                                        key={i}
                                        className={
                                            log.startsWith('✅') ? 'text-green-400' :
                                                log.startsWith('❌') ? 'text-red-400' :
                                                    log.startsWith('🎓') ? 'text-cyan-400' :
                                                        log.startsWith('   ✓') ? 'text-emerald-400' :
                                                            ''
                                        }
                                    >
                                        {log}
                                    </div>
                                ))}
                                {logs.length === 0 && <p className="text-slate-600 italic">Ready to run...</p>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ResearchBacktestModal;
