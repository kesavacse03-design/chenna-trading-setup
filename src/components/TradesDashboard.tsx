import React from 'react';
import DashboardCard from './DashboardCard';
import { Trade, TradeStatus } from '../types';

interface TradesDashboardProps {
  trades: Trade[]; // These are COMPLETED trades
}

const getStatusClass = (status: TradeStatus) => {
  switch (status) {
    case TradeStatus.TARGET_HIT:
      return 'bg-green-500/10 border-green-500/30 text-green-400';
    case TradeStatus.SL_HIT:
      return 'bg-red-500/10 border-red-500/30 text-red-400';
    default:
      return 'bg-slate-500/10 border-slate-500/30 text-slate-400';
  }
};

const CompletedTradeRow: React.FC<{ trade: Trade }> = ({ trade }) => {
    const pnlClass = trade.pnl && trade.pnl >= 0 ? 'text-green-400' : 'text-red-400';

    return (
        <tr className="border-b border-slate-700 hover:bg-slate-800/60 transition-colors duration-200">
            <td className="p-3 font-mono font-semibold">{trade.ticker}</td>
            <td className={`p-3 font-mono text-right ${pnlClass}`}>
                {trade.pnl?.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }) ?? 'N/A'}
            </td>
            <td className="p-3 text-center">
                <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${getStatusClass(trade.status)}`}>
                    {trade.status}
                </span>
            </td>
            <td className="p-3 text-center text-xs font-mono text-slate-400">
                {trade.closeDate ? new Date(trade.closeDate).toLocaleDateString() : 'N/A'}
            </td>
        </tr>
    );
};


const TradesDashboard: React.FC<TradesDashboardProps> = ({ trades }) => {
  return (
    <DashboardCard title="Completed Trades Log" className="overflow-hidden">
        <div className="overflow-y-auto h-full">
            <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-800/80 backdrop-blur-sm z-10">
                    <tr className="border-b border-slate-600">
                        <th className="p-3 font-semibold text-slate-400">Ticker</th>
                        <th className="p-3 font-semibold text-slate-400 text-right">P/L</th>
                        <th className="p-3 font-semibold text-slate-400 text-center">Outcome</th>
                        <th className="p-3 font-semibold text-slate-400 text-center">Close Date</th>
                    </tr>
                </thead>
                <tbody>
                    {trades.map(trade => <CompletedTradeRow key={trade.id} trade={trade} />)}
                     {trades.length === 0 && (
                        <tr>
                            <td colSpan={4} className="text-center p-8 text-slate-500">No trades completed yet.</td>
                        </tr>
                    )}
                </tbody>
            </table>
      </div>
    </DashboardCard>
  );
};

export default TradesDashboard;