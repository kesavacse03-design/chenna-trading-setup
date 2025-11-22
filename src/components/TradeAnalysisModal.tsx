import React from 'react';
import { AnalysisResult, StockData, TradeSetup } from '../types';
import { XMarkIcon } from './icons/XMarkIcon';
import { SpinnerIcon } from './icons/SpinnerIcon';
import { BarChartIcon } from './icons/BarChartIcon';
import { ShieldExclamationIcon } from './icons/ShieldExclamationIcon';
import { LightBulbIcon } from './icons/LightBulbIcon';
import { TargetIcon } from './icons/TargetIcon';
import { PlusIcon } from './icons/PlusIcon';

interface TradeAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    stock: StockData | null;
    isLoading: boolean;
    analysisResult: AnalysisResult | null;
    error: string | null;
    onExecuteTrade: (tradeSetup: TradeSetup, stockTicker: string) => void;
}

const TradeAnalysisModal: React.FC<TradeAnalysisModalProps> = ({
    isOpen,
    onClose,
    stock,
    isLoading,
    analysisResult,
    error,
    onExecuteTrade
}) => {
    if (!isOpen || !stock) return null;

    const handleExecute = () => {
        if(analysisResult?.tradeSetup && stock?.stockName) {
            onExecuteTrade(analysisResult.tradeSetup, stock.stockName);
        }
    };

    const InfoCard = ({ IconComponent, title, content, colorClass }: { IconComponent: React.FC<React.SVGProps<SVGSVGElement>>, title: string, content: string, colorClass: string }) => (
        <div className="bg-slate-800/50 p-3 rounded-lg flex items-start">
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mr-3 ${colorClass}/20`}>
                <IconComponent className={`w-5 h-5 ${colorClass}`} />
            </div>
            <div>
                <h4 className={`text-sm font-semibold ${colorClass}`}>{title}</h4>
                <p className="text-xs text-slate-300">{content}</p>
            </div>
        </div>
    );

    const TradeSetupDisplay = ({ setup }: { setup: TradeSetup }) => {
        const isBuy = setup.signal.toUpperCase() === 'BUY';
        return (
            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                    <div className="flex justify-between items-center mb-3">
                     <h4 className="text-base font-semibold text-slate-200 flex items-center">
                        <TargetIcon className="w-5 h-5 mr-2 text-slate-400" />
                        Actionable Trade Setup
                    </h4>
                    <span className={`px-3 py-1 text-sm font-bold rounded-full ${isBuy ? 'bg-green-500 text-black' : 'bg-red-500 text-white'}`}>{setup.signal}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center mb-3">
                    <div><p className="text-xs text-slate-400">Entry</p><p className="font-mono font-semibold">₹{typeof setup.entry === 'number' ? setup.entry.toFixed(2) : '—'}</p></div>
                    <div><p className="text-xs text-green-400">Target</p><p className="font-mono font-semibold text-green-300">₹{typeof setup.target === 'number' ? setup.target.toFixed(2) : '—'}</p></div>
                    <div><p className="text-xs text-red-400">Stop Loss</p><p className="font-mono font-semibold text-red-300">₹{typeof setup.stopLoss === 'number' ? setup.stopLoss.toFixed(2) : '—'}</p></div>
                </div>
                <div>
                     <p className="text-sm font-semibold text-slate-300 mb-1">Rationale:</p>
                     <p className="text-xs text-slate-400 whitespace-pre-wrap">{setup.rationale}</p>
                </div>
            </div>
        )
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 animate-fade-in-down" onClick={onClose} role="dialog" aria-modal="true">
            <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-2xl m-4" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b border-slate-700">
                    <div>
                        <h2 className="text-lg font-bold text-cyan-300">AI Trade Analysis: <span className="font-mono text-white">{stock.stockName}</span></h2>
                        <p className="text-xs text-slate-400">Analysis as of: {stock.date} | Last Price: ₹{stock.price?.toFixed(2)}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="p-6 max-h-[70vh] overflow-y-auto">
                    {isLoading && (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                            <SpinnerIcon className="w-8 h-8 mb-3" />
                            <p className="font-semibold">ChennaGPT is analyzing the setup...</p>
                            <p className="text-xs">This may take a moment.</p>
                        </div>
                    )}
                    {error && (
                        <div className="flex flex-col items-center justify-center h-64 text-red-400 bg-red-500/10 rounded-lg p-4">
                            <ShieldExclamationIcon className="w-8 h-8 mb-3"/>
                            <p className="font-semibold text-center">Analysis Failed</p>
                            <p className="text-xs text-center">{error}</p>
                        </div>
                    )}
                    {analysisResult && !isLoading && !error && (
                         <div className="space-y-4 animate-fade-in-down">
                            <div>
                                <h3 className="text-base font-semibold text-slate-300 mb-2">Institutional Analysis</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <InfoCard IconComponent={BarChartIcon} title="Strength" content={analysisResult.analysis.strength} colorClass="text-green-400" />
                                    <InfoCard IconComponent={ShieldExclamationIcon} title="Potential Traps" content={analysisResult.analysis.traps} colorClass="text-yellow-400" />
                                    <InfoCard IconComponent={LightBulbIcon} title="Market Psychology" content={analysisResult.analysis.psychology} colorClass="text-purple-400" />
                                     <div className="bg-slate-800/50 p-3 rounded-lg flex flex-col items-center justify-center">
                                        <h4 className="text-sm font-semibold text-cyan-300">Confidence Score</h4>
                                        <p className="text-4xl font-bold font-mono text-white">{analysisResult.confidenceScore}<span className="text-2xl text-slate-400">%</span></p>
                                    </div>
                                </div>
                            </div>
                            <TradeSetupDisplay setup={analysisResult.tradeSetup} />
                        </div>
                    )}
                </div>
                
                {analysisResult && !isLoading && !error && (
                    <div className="flex justify-end p-4 bg-slate-800/50 border-t border-slate-700 rounded-b-lg">
                        <button onClick={handleExecute} className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-6 rounded-lg flex items-center justify-center transition-colors">
                            <PlusIcon className="w-5 h-5 mr-2" />
                            Execute Trade
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TradeAnalysisModal;