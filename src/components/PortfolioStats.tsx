import React from 'react';
import DashboardCard from './DashboardCard';
import { Trade } from '../types';

interface PortfolioStatsProps {
  activeTrades: Trade[];
  totalCapital: number;
}

const PortfolioStats: React.FC<PortfolioStatsProps> = ({ activeTrades, totalCapital }) => {
  const deployedCapital = activeTrades.reduce((acc, trade) => acc + (trade.entry * trade.positionSize), 0);
  const totalRisk = activeTrades.reduce((acc, trade) => acc + trade.capitalAtRisk, 0);

  const StatItem: React.FC<{ label: string; value: string; className?: string }> = ({ label, value, className }) => (
    <div className="text-center">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`text-lg font-bold font-mono ${className}`}>{value}</p>
    </div>
  );

  return (
    <DashboardCard title="Portfolio Snapshot">
      <div className="h-full flex items-center justify-around">
        <StatItem label="Total Capital" value={`₹${(totalCapital / 100000).toFixed(2)}L`} className="text-white" />
        <StatItem label="Deployed" value={`₹${(deployedCapital / 100000).toFixed(2)}L`} className="text-cyan-300" />
        <StatItem label="Total Risk" value={`₹${totalRisk.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} className="text-red-400" />
      </div>
    </DashboardCard>
  );
};

export default PortfolioStats;