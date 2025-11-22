import React, { useMemo } from 'react';
import { BacktestReport, StrategyLogic } from '../types';
import { XMarkIcon } from './icons/XMarkIcon';
import { BrainIcon } from './icons/BrainIcon';

interface BaseStrategyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  report: BacktestReport;
  logic: StrategyLogic;
  mode: 'confirm' | 'view';
}

const StatCard = ({ label, value, className = '' }: { label: string; value: string | number; className?: string }) => (
    <div className="bg-slate-800/50 p-2 rounded-md text-center">
        <p className="text-xs text-slate-400">{label}</p>
        <p className={`font-mono text-lg font-bold ${className}`}>{value}</p>
    </div>
);

const BaseStrategyReportModal: React.FC<BaseStrategyReportModalProps> = ({ isOpen, onClose, onConfirm, report, logic, mode }) => {
    if (!isOpen) return null;
    
    const isCandidate = mode === 'confirm';

    const rulesArray = useMemo(() => {
        if (Array.isArray(logic.rules)) {
            return logic.rules;
        }
        if (typeof logic.rules === 'string') {
            return (logic.rules as string).split('\n').filter(Boolean);
        }
        return [];
    }, [logic.rules]);

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-[60] animate-fade-in-down" onClick={onClose} role="dialog">
            <div className="bg-slate-900 border border-cyan-500/30 rounded-lg shadow-2xl w-full max-w-4xl m-4 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-slate-700">
                    <h2 className="text-lg font-semibold text-cyan-300 flex items-center">
                        <BrainIcon className="w-5 h-5 mr-3" />
                        Base Strategy Report: <span className="font-mono ml-2 text-white">{report.categoryKey.replace(/_/g, ' ')} {isCandidate ? `V${report.versionId} Candidate` : `V${report.versionId}`}</span>
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close"><XMarkIcon className="w-6 h-6" /></button>
                </div>
                
                <div className="flex-grow p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left Panel: Logic & Details */}
                    <div className="flex flex-col gap-4">
                         <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                             <h3 className="font-semibold text-slate-200 mb-2">Generated Strategy Logic</h3>
                             <p className="text-sm text-slate-300 mb-2">{logic.description}</p>
                             <ul className="text-sm text-slate-300 list-disc pl-5 space-y-1 font-mono">
                                {rulesArray.map((rule, i) => <li key={i}>{rule}</li>)}
                             </ul>
                        </div>
                         <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                             <h3 className="font-semibold text-slate-200 mb-2">Indicators & Filters Applied</h3>
                             <div className="flex flex-wrap gap-2">
                                {(logic.indicators || []).map((ind, i) => (
                                    <span key={i} className="text-xs bg-purple-500/20 text-purple-300 font-semibold px-2 py-1 rounded-full">{ind}</span>
                                ))}
                                 {(logic.indicators || []).length === 0 && <p className="text-xs text-slate-500">No specific indicators were cited by the AI.</p>}
                             </div>
                        </div>
                    </div>

                    {/* Right Panel: Performance & Data */}
                    <div className="flex flex-col gap-4">
                        <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                             <h3 className="font-semibold text-slate-200 mb-2">Simulated Performance Metrics</h3>
                             <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                 <StatCard label="Accuracy" value={`${report.summary.accuracy.toFixed(1)}%`} className="text-cyan-300" />
                                 <StatCard label="Confidence" value={`${report.summary.confidenceRating.toFixed(1)}%`} className="text-purple-300" />
                                 <StatCard label="Avg P/L" value={`${report.summary.averagePL.toFixed(2)}%`} className={report.summary.averagePL > 0 ? 'text-green-400' : 'text-red-400'} />
                                 <StatCard label="Max Drawdown" value={`${report.summary.maxDrawdown.toFixed(2)}%`} className="text-yellow-400" />
                                 <StatCard label="Wins" value={report.summary.wins} className="text-green-300" />
                                 <StatCard label="Losses" value={report.summary.losses} className="text-red-300" />
                             </div>
                        </div>
                         <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700 flex-grow flex flex-col">
                             <h3 className="font-semibold text-slate-200 mb-2">Backtest Details</h3>
                             <p className="text-sm text-slate-400 mb-2">Tested on {report.summary.totalTrades} historical trades from <span className="font-semibold text-white">{report.backtestPeriod}</span>. OHLCV Source: Upstox API (Simulated).</p>
                             <div className="flex-grow overflow-y-auto bg-slate-900/50 p-2 rounded-md border border-slate-600 min-h-[10rem]">
                                <p className="text-xs text-slate-500 mb-2">Analysis stocks (not added to live watchlist):</p>
                                <div className="flex flex-wrap gap-1.5">
                                     {report.tickersUsed.map(ticker => (
                                        <span key={ticker} className="text-xs bg-slate-700 text-slate-300 font-mono px-2 py-0.5 rounded">{ticker}</span>
                                     ))}
                                </div>
                             </div>
                        </div>
                    </div>
                </div>

                <div className="flex-shrink-0 flex justify-end p-4 bg-slate-800/50 border-t border-slate-700">
                    {mode === 'confirm' ? (
                        <>
                            <button onClick={onClose} className="bg-slate-600 hover:bg-slate-500 text-white font-semibold py-2 px-6 rounded-lg transition-colors mr-4">Discard</button>
                            <button onClick={onConfirm} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-6 rounded-lg transition-colors">Confirm & Save to Workbench</button>
                        </>
                    ) : (
                         <button onClick={onClose} className="bg-slate-600 hover:bg-slate-500 text-white font-semibold py-2 px-6 rounded-lg transition-colors">Close</button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BaseStrategyReportModal;