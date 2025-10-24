import React, { useState } from 'react';
import { BacktestReport, Notification } from '../types';
import DashboardCard from './DashboardCard';
import { BrainIcon } from './icons/BrainIcon';
import { BellIcon } from './icons/BellIcon';
import NotificationsPanel from './NotificationsPanel';

type Tab = 'reports' | 'notifications';

interface IntelligencePanelProps {
    reports: BacktestReport[];
    notifications: Notification[];
    onViewReport: (reportId: string) => void;
    onClearNotification: (id: number) => void;
}

const ReportRow = ({ report, onView }: { report: BacktestReport, onView: () => void }) => {
    const statusClass = report.status === 'live' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400';
    
    return (
    <div onClick={onView} className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg mb-2 hover:bg-slate-700/50 cursor-pointer transition-colors duration-200">
        <div className="flex justify-between items-center">
            <div>
                <p className="text-cyan-400 text-sm font-semibold">{report.categoryKey.replace(/_/g, ' ')} <span className="font-mono text-slate-400">(V{report.versionId})</span></p>
                <p className="text-xs text-slate-500 font-mono">Generated: {new Date(report.generatedAt).toLocaleString()}</p>
            </div>
            <span className={`px-2 py-1 text-xs font-bold rounded-full ${statusClass}`}>{report.status}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center mt-2 pt-2 border-t border-slate-700/50">
            <div><p className="text-xs text-slate-400">Accuracy</p><p className="font-mono text-base font-bold text-cyan-300">{report.summary.accuracy.toFixed(1)}%</p></div>
            <div><p className="text-xs text-slate-400">Trades</p><p className="font-mono text-base font-bold">{report.summary.totalTrades}</p></div>
            <div><p className="text-xs text-slate-400">Avg P/L</p><p className={`font-mono text-base font-bold ${report.summary.averagePL >= 0 ? 'text-green-400' : 'text-red-400'}`}>{report.summary.averagePL.toFixed(2)}%</p></div>
        </div>
    </div>
);
}

const IntelligencePanel: React.FC<IntelligencePanelProps> = ({ reports, notifications, onViewReport, onClearNotification }) => {
    const [activeTab, setActiveTab] = useState<Tab>('notifications');
    
    const TabButton: React.FC<{ tabName: Tab; icon: React.ReactNode; label: string, count: number }> = ({ tabName, icon, label, count }) => (
        <button
            onClick={() => setActiveTab(tabName)}
            className={`flex-1 flex items-center justify-center p-3 text-xs font-semibold border-b-2 transition-all duration-200 relative ${activeTab === tabName ? 'border-cyan-400 text-cyan-300 bg-slate-800' : 'border-transparent text-slate-400 hover:bg-slate-700/50'}`}
        >
            {icon}
            <span className="ml-2 hidden sm:inline">{label}</span>
            {count > 0 && (
                <span className={`ml-2 text-xs ${tabName === 'reports' ? 'bg-purple-400' : 'bg-cyan-500/80'} text-slate-900 font-bold rounded-full px-2 py-0.5`}>
                    {count}
                </span>
            )}
        </button>
    );

    const renderTabContent = () => {
        if (activeTab === 'reports') {
            return (
                <div className="flex-grow overflow-y-auto p-2 space-y-2">
                    {reports.length > 0 ? (
                        [...reports]
                          .sort((a,b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())
                          .map(report => <ReportRow key={report.id} report={report} onView={() => onViewReport(report.id)} />)
                    ) : (
                        <div className="flex items-center justify-center h-full text-center">
                            <div>
                                <BrainIcon className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                                <p className="text-slate-500 text-sm">Strategy reports will be available in live mode.</p>
                            </div>
                        </div>
                    )}
                </div>
            );
        }
        if (activeTab === 'notifications') {
            return <div className="p-1 sm:p-2 h-full"><NotificationsPanel notifications={notifications} onClearNotification={onClearNotification} /></div>;
        }
        return null;
    };


    return (
        <DashboardCard title="Strategy & System Intelligence" className="h-96">
            <div className="flex flex-col h-full">
                <div className="flex border-b border-slate-700 flex-shrink-0">
                    <TabButton tabName="reports" icon={<BrainIcon className="w-4 h-4" />} label="Strategy Reports" count={reports.length} />
                    <TabButton tabName="notifications" icon={<BellIcon className="w-4 h-4" />} label="System Log" count={notifications.length} />
                </div>
                <div className="flex-grow overflow-y-auto">
                    {renderTabContent()}
                </div>
            </div>
        </DashboardCard>
    );
};

export default IntelligencePanel;
