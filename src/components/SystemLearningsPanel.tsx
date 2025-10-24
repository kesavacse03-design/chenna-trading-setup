import React from 'react';
import { SystemLearning } from '../types';
import { BrainIcon } from './icons/BrainIcon';

const SystemLearningsPanel: React.FC<{ learnings: SystemLearning[] }> = ({ learnings }) => {
    return (
        <div className="h-full flex flex-col">
            <h3 className="text-sm font-semibold text-purple-300 mb-2 px-2 flex items-center">
                <BrainIcon className="w-4 h-4 mr-2"/>
                AI-Generated V2 Insights
            </h3>
            <div className="flex-grow overflow-y-auto pr-2 space-y-3">
                {learnings.length > 0 ? learnings.map(learning => (
                    <div 
                        key={learning.tradeId} 
                        className="p-3 bg-slate-800/70 border border-slate-700 rounded-lg animate-fade-in-down"
                    >
                        <h4 className="font-semibold text-cyan-300 text-xs mb-2">
                            Post-Mortem for <span className="font-mono text-white">{learning.ticker}</span>
                        </h4>
                        <div className="space-y-2 text-xs">
                            <div>
                                <p className="font-semibold text-slate-400">Identified Failure Pattern:</p>
                                <p className="text-slate-300">{learning.analysis.failurePattern}</p>
                            </div>
                            <div>
                                <p className="font-semibold text-purple-300">V2 Strategy Improvement:</p>
                                <p className="text-slate-300">{learning.analysis.v2Improvement}</p>
                            </div>
                        </div>
                    </div>
                )) : (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                             <BrainIcon className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                            <p className="text-slate-500 text-sm">AI insights from failed trades will appear here.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SystemLearningsPanel;