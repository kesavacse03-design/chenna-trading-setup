import React from 'react';
import { BacktestEntry } from '../types';

const BacktestLogPanel: React.FC<{ backtestLog: BacktestEntry[] }> = ({ backtestLog }) => {
    
    const getOutcomeClass = (outcome: 'Win' | 'Loss') => {
        switch (outcome) {
            case 'Win': return 'text-green-400';
            case 'Loss': return 'text-red-400';
        }
    };

    return (
        <div className="h-full flex flex-col">
            <h3 className="text-sm font-semibold text-cyan-300 mb-2 px-2">Completed Trades Log</h3>
             <div className="flex-grow overflow-y-auto text-xs font-mono">
                <table className="w-full text-left">
                    <thead className="sticky top-0 bg-slate-800/80 backdrop-blur-sm">
                        <tr className="border-b border-slate-700">
                            <th className="p-2 font-semibold">Ticker</th>
                            <th className="p-2 font-semibold">Outcome</th>
                            <th className="p-2 font-semibold text-right">P/L (₹)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {backtestLog.length > 0 ? backtestLog.map((entry, i) => (
                            <tr key={`${entry.ticker}-${entry.entryDate}-${i}`} className="border-b border-slate-800 hover:bg-slate-700/50">
                                <td className="p-2 text-slate-300 flex items-center">
                                    {entry.ticker}
                                </td>
                                <td className={`p-2 font-semibold ${getOutcomeClass(entry.outcome)}`}>{entry.outcome}</td>
                                <td className={`p-2 text-right font-semibold ${getOutcomeClass(entry.outcome)}`}>
                                    {entry.pnl.toFixed(2)}
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={3} className="text-center p-8 text-slate-500 text-sm">
                                    No completed trades yet.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default BacktestLogPanel;