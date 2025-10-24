import React from 'react';

interface DashboardCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

const DashboardCard: React.FC<DashboardCardProps> = ({ title, children, className = '' }) => {
  return (
    <div className={`bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg shadow-lg p-4 sm:p-6 flex flex-col ${className}`}>
      <h2 className="text-lg font-semibold text-cyan-300 mb-4 flex-shrink-0">{title}</h2>
      {children}
    </div>
  );
};

export default DashboardCard;