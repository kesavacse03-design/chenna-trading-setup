import React from 'react';

export interface Settings {
    autoSkipLow: boolean;
    autoSkipAgainstTrend: boolean;
}

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: Settings;
    onToggle: (key: keyof Settings) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onToggle }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl border border-slate-700">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        🛡️ Filter Settings
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        ✕
                    </button>
                </div>

                <div className="space-y-4">
                    <div className="p-3 bg-slate-700/30 rounded-lg">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.autoSkipAgainstTrend}
                                onChange={() => onToggle('autoSkipAgainstTrend')}
                                className="w-5 h-5 rounded border-slate-500 bg-slate-700 text-cyan-600 focus:ring-cyan-500 focus:ring-offset-slate-800"
                            />
                            <div className="flex-1">
                                <span className="text-base font-medium text-slate-200 block">Auto-Skip "Against Trend"</span>
                                <span className="text-xs text-slate-400 block mt-1">
                                    Skip signals if Nifty trend opposes trade direction.
                                    <span className="block text-orange-400/80 mt-0.5">Prevents ~33% win-rate trades.</span>
                                </span>
                            </div>
                        </label>
                    </div>

                    <div className="p-3 bg-slate-700/30 rounded-lg">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.autoSkipLow}
                                onChange={() => onToggle('autoSkipLow')}
                                className="w-5 h-5 rounded border-slate-500 bg-slate-700 text-cyan-600 focus:ring-cyan-500 focus:ring-offset-slate-800"
                            />
                            <div className="flex-1">
                                <span className="text-base font-medium text-slate-200 block">Auto-Skip "Low Confidence"</span>
                                <span className="text-xs text-slate-400 block mt-1">
                                    Skip any signals with score 0 (Mixed/Neutral factors).
                                </span>
                            </div>
                        </label>
                    </div>
                </div>

                <div className="mt-6 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
