import React, { useState, useEffect } from 'react';
import { StrategyLogic } from '../types';
import { XMarkIcon } from './icons/XMarkIcon';
import { BrainIcon } from './icons/BrainIcon';
import { WrenchScrewdriverIcon } from './icons/WrenchScrewdriverIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { SpinnerIcon } from './icons/SpinnerIcon';
import { DocumentTextIcon } from './icons/DocumentTextIcon';
import { LightBulbIcon } from './icons/LightBulbIcon';

interface StrategyWorkbenchModalProps {
    isOpen: boolean;
    onClose: () => void;
    categoryKey: string;
    initialLogic: StrategyLogic;
    onSaveStrategy: (categoryKey: string, newLogic: StrategyLogic) => void;
}

const StrategyEditor = ({ logic, onLogicChange, onSave, onSanityCheck, isLoadingSanityCheck }: { logic: StrategyLogic, onLogicChange: (logic: StrategyLogic) => void, onSave: () => void, onSanityCheck: () => void, isLoadingSanityCheck: boolean }) => (
    <div className="p-4 rounded-lg bg-slate-800/70 border border-slate-700 flex-1">
        <h3 className="font-semibold text-lg flex items-center mb-3 text-cyan-300">
            <DocumentTextIcon className="w-5 h-5 mr-2" />
            V1 Strategy Logic
        </h3>
        <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
            <textarea value={logic.description} onChange={e => onLogicChange({ ...logic, description: e.target.value })} className="w-full bg-slate-700/50 rounded p-2 text-sm h-20 resize-none border border-slate-600"/>
        </div>
        <div className="mt-2">
            <label className="block text-sm font-medium text-slate-300 mb-1">Rules (one per line)</label>
            <textarea 
                value={Array.isArray(logic.rules) ? logic.rules.join('\n') : String(logic.rules || '')} 
                onChange={e => onLogicChange({ ...logic, rules: e.target.value.split('\n') })} 
                className="w-full bg-slate-700/50 rounded p-2 text-sm font-mono h-32 resize-none border border-slate-600"
            />
        </div>
        <div className="mt-4 flex justify-between items-center">
            <button onClick={onSanityCheck} disabled={!logic.description || (Array.isArray(logic.rules) && logic.rules.every(r => r === '')) || isLoadingSanityCheck} className="bg-purple-600/50 hover:bg-purple-600/80 text-white text-sm font-semibold py-2 px-4 rounded-lg disabled:bg-slate-600 flex items-center">
                {isLoadingSanityCheck ? <SpinnerIcon className="w-4 h-4 mr-2" /> : <SparklesIcon className="w-4 h-4 mr-2" />}
                Sanity Check
            </button>
            <button onClick={onSave} disabled={!logic.description || (Array.isArray(logic.rules) && logic.rules.every(r => r === ''))} className="bg-cyan-700 hover:bg-cyan-600 text-white font-bold py-2 px-5 rounded-lg disabled:bg-slate-600">
                Save V1 Strategy
            </button>
        </div>
    </div>
);

const AIInteractionPanel = () => (
    <div className="p-4 rounded-lg flex flex-col items-center justify-center text-center bg-slate-800/50 border border-slate-700 h-full">
        <SparklesIcon className="w-10 h-10 text-slate-600 mb-3" />
        <h3 className="font-semibold text-lg text-slate-400">AI Features Disabled</h3>
        <p className="text-sm text-slate-500 max-w-md my-2">AI-powered strategy generation and backtesting require a live backend connection. This feature is unavailable in Preview Mode.</p>
    </div>
);


const StrategyWorkbenchModal: React.FC<StrategyWorkbenchModalProps> = ({ isOpen, onClose, categoryKey, initialLogic, onSaveStrategy }) => {
    
    const [editorLogic, setEditorLogic] = useState<StrategyLogic>(initialLogic);
    const [isLoading, setIsLoading] = useState(false);
    const [sanityCheckResults, setSanityCheckResults] = useState<string[]>([]);
    
    useEffect(() => {
        if(isOpen) {
            setEditorLogic(initialLogic);
            setSanityCheckResults([]);
        }
    }, [isOpen, initialLogic]);

    if (!isOpen) return null;
    
    const handleSanityCheck = async () => {
        setIsLoading(true);
        // This is a placeholder as the real check requires the backend AI.
        setTimeout(() => {
            setSanityCheckResults([
                "Consider adding a specific volume confirmation metric (e.g., > 1.5x average).",
                "Rule #4 is subjective. Quantify 'not excessively overbought' with a specific RSI value.",
            ]);
            setIsLoading(false);
        }, 1000);
    };

    const handleSaveEditor = () => {
        onSaveStrategy(categoryKey, editorLogic);
        onClose();
    };
    
    return (
      <>
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 animate-fade-in-down" onClick={onClose} role="dialog">
            <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-6xl m-4 flex flex-col max-h-[90vh]">
                <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-slate-700">
                    <h2 className="text-lg font-semibold text-cyan-300 flex items-center">
                        <WrenchScrewdriverIcon className="w-5 h-5 mr-3" />
                        Strategy Workbench: <span className="font-mono ml-2 text-white">{categoryKey.replace(/_/g, ' ')}</span>
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close"><XMarkIcon className="w-6 h-6" /></button>
                </div>
                <div className="flex-grow p-6 overflow-y-auto">
                    <div className="flex flex-col lg:flex-row gap-6">
                        <div className="lg:w-1/2 flex flex-col">
                            <StrategyEditor 
                                logic={editorLogic}
                                onLogicChange={setEditorLogic}
                                onSave={handleSaveEditor} 
                                onSanityCheck={handleSanityCheck} 
                                isLoadingSanityCheck={isLoading} 
                            />
                             {sanityCheckResults.length > 0 && (
                                <div className="mt-4 p-3 bg-purple-900/40 border border-purple-600/50 rounded-lg animate-fade-in-down">
                                    <h4 className="font-semibold text-purple-300 mb-2 text-sm flex items-center"><LightBulbIcon className="w-4 h-4 mr-2"/>Sanity Check Suggestions:</h4>
                                    <ul className="text-xs text-slate-300 list-disc pl-5 space-y-1">
                                        {sanityCheckResults.map((s,i) => <li key={i}>{s}</li>)}
                                    </ul>
                                </div>
                            )}
                        </div>
                        <div className="lg:w-1/2 flex flex-col">
                            <AIInteractionPanel />
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </>
    );
};

export default StrategyWorkbenchModal;