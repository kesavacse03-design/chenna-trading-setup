import React from 'react';

// Utility to build stable unique keys
export const buildStableKey = (parts: (string | number | undefined | null)[]) => parts.filter(Boolean).map(String).join('::');

interface DashboardCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode; // Optional right-side action
}

const DashboardCard: React.FC<DashboardCardProps> = ({ title, children, className = '', action }) => {
  return (
    <div className={`bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg shadow-lg p-4 sm:p-6 flex flex-col ${className}`}>
      <div className="flex justify-between items-center mb-4 flex-shrink-0">
        <h2 className="text-lg font-semibold text-cyan-300">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
};

export default DashboardCard;