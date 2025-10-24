import React from 'react';
import { KeyIcon } from './icons/KeyIcon';
import { XMarkIcon } from './icons/XMarkIcon';

interface CredentialsManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

const envContent = `
# Port for the backend server
PORT=3001

# Path for the SQLite database file (optional, has a default)
# DB_PATH=../data/trader.db

# Gemini API Key for AI features
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

# Upstox API Credentials for live data and backtesting
UPSTOX_API_KEY="YOUR_UPSTOX_API_KEY"
UPSTOX_API_SECRET="YOUR_UPSTOX_API_SECRET"
UPSTOX_ACCESS_TOKEN="YOUR_UPSTOX_ACCESS_TOKEN" # Optional, if you have one
`.trim();

const CredentialsManager: React.FC<CredentialsManagerProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 animate-fade-in-down" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="credentials-modal-title">
      <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl w-full max-w-2xl m-4" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-slate-700">
          <h2 id="credentials-modal-title" className="text-lg font-semibold text-cyan-300 flex items-center">
            <KeyIcon className="w-5 h-5 mr-2" />
            Backend Server Configuration
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6 space-y-4">
            <div className="text-sm text-slate-300 space-y-2">
                <p>This application requires a backend server to function correctly. API keys are managed securely on the server, not in the browser.</p>
                <p>To configure the server, create a file named `.env` in the `backend` directory, copy the content below into it, and fill in your actual API credentials.</p>
            </div>
            
            <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">.env file content:</label>
                <pre className="bg-slate-900 text-slate-300 text-xs rounded-md p-4 overflow-x-auto font-mono border border-slate-600">
                    <code>
                        {envContent}
                    </code>
                </pre>
            </div>
        </div>
        <div className="flex justify-end p-4 bg-slate-800/50 border-t border-slate-700 rounded-b-lg">
          <button onClick={onClose} className="bg-slate-600 hover:bg-slate-500 text-white font-semibold py-2 px-6 rounded-lg transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default CredentialsManager;