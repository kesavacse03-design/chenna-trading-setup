import React from 'react';
import DashboardCard from './DashboardCard';
import { Trade, TradeStatus } from '../types';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { XCircleIcon } from './icons/XCircleIcon';

interface ActiveTradesDashboardProps {
  trades: Trade[];
}

const getStatusClass = (status: TradeStatus) => {
  switch (status) {
    case TradeStatus.ACTIVE:
      return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
    default:
      return 'bg-gray-500/10 text-gray-400';
  }
};

const TradeRow: React.FC<{ trade: Trade }> = ({ trade }) => {
    const baseClasses = "border-b border-slate-700 hover:bg-slate-800/60 transition-colors duration-200";
    const animationClass = trade.isNew ? 'animate-fade-in-down' : '';

    return (
        <tr className={`${baseClasses} ${animationClass}`}>
            <td className="p-3 font-mono font-semibold">{trade.ticker}</td>
            <td className="p-3 text-gray-300">{trade.entry.toFixed(2)}</td>
            <td className="p-3 text-green-400">{trade.target.toFixed(2)}</td>
            <td className="p-3 text-red-400">{trade.stopLoss.toFixed(2)}</td>
            <td className="p-3 font-mono text-center text-purple-300">V{trade.strategyVersionId}</td>
            <td className="p-3 font-mono text-center">₹{trade.capitalAtRisk.toFixed(0)}</td>
            <td className="p-3 text-center">{trade.age}</td>
            <td className="p-3">
                <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${getStatusClass(trade.status)}`}>
                    {trade.status}
                </span>
            </td>
        </tr>
    );
};


const ActiveTradesDashboard: React.FC<ActiveTradesDashboardProps> = ({ trades }) => {
  return (
    <DashboardCard title="Active Trades" className="overflow-hidden">
        <div className="overflow-y-auto h-full">
            <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-800/80 backdrop-blur-sm z-10">
                    <tr className="border-b border-slate-600">
                        <th className="p-3 font-semibold text-slate-400">Ticker</th>
                        <th className="p-3 font-semibold text-slate-400">Entry</th>
                        <th className="p-3 font-semibold text-slate-400">Target</th>
                        <th className="p-3 font-semibold text-slate-400">Stop Loss</th>
                        <th className="p-3 font-semibold text-slate-400 text-center">Strat. Ver.</th>
                        <th className="p-3 font-semibold text-slate-400 text-center">Risk (₹)</th>
                        <th className="p-3 font-semibold text-slate-400 text-center">Age (D)</th>
                        <th className="p-3 font-semibold text-slate-400">Status</th>
                    </tr>
                </thead>
                <tbody>
                    {trades.map(trade => <TradeRow key={trade.id} trade={trade} />)}
                     {trades.length === 0 && (
                        <tr>
                            <td colSpan={8} className="text-center p-8 text-slate-500">No active trades being tracked.</td>
                        </tr>
                    )}
                </tbody>
            </table>
      </div>
    </DashboardCard>
  );
};

export default ActiveTradesDashboard;
