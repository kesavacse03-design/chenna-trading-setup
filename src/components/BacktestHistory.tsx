import React from 'react';

interface BacktestHistoryProps {
    categoryKey: string;
    versionId: number | string;
    backtests: any[];
}

export function BacktestHistory({ categoryKey, versionId, backtests }: BacktestHistoryProps) {
    if (!backtests || backtests.length === 0) {
        return (
            <div className="p-6 rounded-xl bg-slate-800 border border-slate-700">
                <h3 className="text-lg font-bold text-cyan-400 mb-4">Backtest History - V{versionId}</h3>
                <div className="text-sm text-slate-500 text-center py-8">
                    No backtest history available for this version
                </div>
            </div>
        );
    }

    const handleExportCSV = () => {
        // Convert backtest history to CSV
        const headers = ['Date', 'Accuracy', 'PnL', 'Trades', 'Win Rate'];
        const csvContent = [
            headers.join(','),
            ...backtests.map(test => [
                new Date(test.date).toLocaleDateString(),
                test.accuracy || 0,
                test.pnl || 0,
                test.trades || 0,
                test.winRate || 0
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${categoryKey}_V${versionId}_history.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    return (
        <div className="p-6 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 shadow-xl">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
                    📊 Backtest History - V{versionId}
                </h3>
                <button
                    onClick={handleExportCSV}
                    className="text-xs bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 rounded transition"
                >
                    Download CSV
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-700">
                            <th className="text-left py-2 px-3 text-slate-400 font-semibold">Date</th>
                            <th className="text-right py-2 px-3 text-slate-400 font-semibold">Accuracy</th>
                            <th className="text-right py-2 px-3 text-slate-400 font-semibold">PnL</th>
                            <th className="text-right py-2 px-3 text-slate-400 font-semibold">Trades</th>
                            <th className="text-right py-2 px-3 text-slate-400 font-semibold">Win Rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        {backtests.map((test, idx) => (
                            <tr key={idx} className="border-b border-slate-800 hover:bg-slate-700/30">
                                <td className="py-2 px-3 text-slate-300">
                                    {new Date(test.date).toLocaleDateString()}
                                </td>
                                <td className="py-2 px-3 text-right">
                                    <span className={test.accuracy >= 70 ? 'text-green-400' : 'text-yellow-400'}>
                                        {test.accuracy}%
                                    </span>
                                </td>
                                <td className="py-2 px-3 text-right">
                                    <span className={test.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                                        ₹{test.pnl.toLocaleString()}
                                    </span>
                                </td>
                                <td className="py-2 px-3 text-right text-slate-300">
                                    {test.trades}
                                </td>
                                <td className="py-2 px-3 text-right">
                                    <span className={test.winRate >= 50 ? 'text-green-400' : 'text-yellow-400'}>
                                        {test.winRate}%
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Summary Stats */}
            <div className="mt-4 grid grid-cols-4 gap-3">
                <div className="bg-slate-900/50 rounded p-2">
                    <div className="text-xs text-slate-500">Avg Accuracy</div>
                    <div className="text-sm font-bold text-cyan-400">
                        {(backtests.reduce((sum, t) => sum + (t.accuracy || 0), 0) / backtests.length).toFixed(1)}%
                    </div>
                </div>
                <div className="bg-slate-900/50 rounded p-2">
                    <div className="text-xs text-slate-500">Total PnL</div>
                    <div className="text-sm font-bold text-green-400">
                        ₹{backtests.reduce((sum, t) => sum + (t.pnl || 0), 0).toLocaleString()}
                    </div>
                </div>
                <div className="bg-slate-900/50 rounded p-2">
                    <div className="text-xs text-slate-500">Total Trades</div>
                    <div className="text-sm font-bold text-slate-300">
                        {backtests.reduce((sum, t) => sum + (t.trades || 0), 0)}
                    </div>
                </div>
                <div className="bg-slate-900/50 rounded p-2">
                    <div className="text-xs text-slate-500">Avg Win Rate</div>
                    <div className="text-sm font-bold text-cyan-400">
                        {(backtests.reduce((sum, t) => sum + (t.winRate || 0), 0) / backtests.length).toFixed(1)}%
                    </div>
                </div>
            </div>
        </div>
    );
}
