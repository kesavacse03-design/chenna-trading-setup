import React from 'react';
import DashboardCard from './DashboardCard';
import { Trade, TradeStatus } from '../types';
import { ArrowUpRightIcon } from './icons/ArrowUpRightIcon';
import { ArrowDownRightIcon } from './icons/ArrowDownRightIcon';

interface DailySummaryProps {
  completedTrades: Trade[];
}

const isToday = (someDate: Date) => {
    const today = new Date();
    return someDate.getDate() === today.getDate() &&
        someDate.getMonth() === today.getMonth() &&
        someDate.getFullYear() === today.getFullYear();
}

const DailySummary: React.FC<DailySummaryProps> = ({ completedTrades }) => {
  const todaysTrades = completedTrades.filter(trade => trade.closeDate && isToday(new Date(trade.closeDate)));

  const totalPL = todaysTrades.reduce((acc, trade) => acc + (trade.pnl || 0), 0);
  const wins = todaysTrades.filter(t => t.status === TradeStatus.TARGET_HIT).length;
  const losses = todaysTrades.filter(t => t.status === TradeStatus.SL_HIT).length;
  const totalTrades = wins + losses;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  const StatItem: React.FC<{ label: string; value: string | number; icon?: React.ReactNode }> = ({ label, value, icon }) => (
    <div className="flex justify-between items-center p-2 bg-slate-800/50 rounded-md">
      <div className="flex items-center">
        {icon}
        <p className="text-sm text-slate-300 ml-2">{label}</p>
      </div>
      <p className="font-mono font-semibold">{value}</p>
    </div>
  );

  return (
    <DashboardCard title="Today's Performance">
      <div className="h-full flex flex-col justify-between">
        <div className={`p-4 rounded-lg text-center mb-4 ${totalPL >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
          <p className="text-sm text-slate-400">Net P/L</p>
          <p className={`text-2xl font-bold font-mono ${totalPL >= 0 ? 'text-green-300' : 'text-red-300'}`}>
            ₹{totalPL.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="space-y-2">
            <StatItem label="Win Rate" value={`${winRate.toFixed(1)}%`} />
            <StatItem label="Winners" value={wins} icon={<ArrowUpRightIcon className="w-4 h-4 text-green-400" />} />
            <StatItem label="Losers" value={losses} icon={<ArrowDownRightIcon className="w-4 h-4 text-red-400" />} />
        </div>
      </div>
    </DashboardCard>
  );
};

export default DailySummary;