import React, { useState, useEffect } from 'react';
import { KeyIcon } from './icons/KeyIcon';
import { XMarkIcon } from './icons/XMarkIcon';

interface CredentialsManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

const envContent = `
# Backend port
BACKEND_PORT=3001

# Upstox OAuth credentials (required for live data)
UPSTOX_CLIENT_ID=your_client_id
UPSTOX_CLIENT_SECRET=your_client_secret
UPSTOX_REDIRECT_URI=http://localhost:3001/auth/upstox/callback

# Session secret for signing (dev value is fine locally)
SESSION_SECRET=change_me
`.trim();

const CredentialsManager: React.FC<CredentialsManagerProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const LS_KEY = 'cts_api_base';
  const LS_MODE = 'cts_mode';
  const [apiBase, setApiBase] = useState<string>('');
  const [mode, setMode] = useState<'preview'|'live'>('preview');

  useEffect(() => {
    try {
      const v = localStorage.getItem(LS_KEY) || '';
      const m = (localStorage.getItem(LS_MODE) as 'preview'|'live') || (v ? 'live' : 'preview');
      setApiBase(v);
      setMode(m);
    } catch (e) { /* ignore */ }
  }, []);

  const save = () => {
    try {
      localStorage.setItem(LS_KEY, apiBase || '');
      localStorage.setItem(LS_MODE, mode);
      // apply at runtime so pages reflect change without reload
      (window as any).__CTS_API_BASE = mode === 'live' && apiBase ? apiBase : '';
      // notify user via event
  window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: 'Settings saved', kind: 'success' } }));
  // notify app about API base change
  window.dispatchEvent(new CustomEvent('cts:api-changed'));
    } catch (e) { console.warn('Failed to persist settings', e); }
    onClose();
  };

  const resetToPreview = () => {
    setApiBase(''); setMode('preview');
    localStorage.removeItem(LS_KEY); localStorage.setItem(LS_MODE, 'preview');
    (window as any).__CTS_API_BASE = '';
    onClose();
  };

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
            <p>This application requires a backend server to manage API keys securely (never store secrets in the browser).</p>
            <p>Create a file named <code>.env</code> in <code>chenna-CTS/backend</code>, paste the content below, and fill your Upstox credentials.</p>
            <ul className="list-disc list-inside text-slate-400">
              <li>Start the backend: <code>npm install</code> then <code>npm start</code> in <code>chenna-CTS/backend</code>.</li>
              <li>Get login URL: open <code>http://localhost:3001/auth/upstox/url</code> and follow the Upstox login.</li>
              <li>After success, check <code>/auth/upstox/status</code>. Prices will be fetched via the backend.</li>
            </ul>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Runtime Mode</label>
            <div className="flex items-center space-x-4 mb-4">
              <button type="button" onClick={() => setMode('preview')} className={"px-3 py-1 rounded-md " + (mode === 'preview' ? 'bg-slate-700 text-slate-200' : 'bg-transparent text-slate-400 border border-slate-700')}>Preview (mock)</button>
              <button type="button" onClick={() => setMode('live')} className={"px-3 py-1 rounded-md " + (mode === 'live' ? 'bg-blue-700 text-white' : 'bg-transparent text-slate-400 border border-slate-700')}>Live (backend)</button>
            </div>

            <label className="block text-sm font-medium text-slate-300 mb-2">API Base (example: http://127.0.0.1:18080)</label>
            <input value={apiBase} onChange={e => setApiBase(e.target.value)} placeholder="http://localhost:3001" className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 text-slate-200 text-sm" />
            <p className="text-xs text-slate-400 mt-2">Set mode to Live and enter an API base to enable backend calls. Leave blank for Preview Mode.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">.env file content:</label>
            <pre className="bg-slate-900 text-slate-300 text-xs rounded-md p-4 overflow-x-auto font-mono border border-slate-600">
              <code>{envContent}</code>
            </pre>
          </div>
  </div>
        <div className="flex justify-end p-4 bg-slate-800/50 border-t border-slate-700 rounded-b-lg space-x-2">
          <button onClick={resetToPreview} className="bg-rose-600 hover:bg-rose-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Reset to Preview</button>
          <button onClick={save} className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Save</button>
          <button onClick={onClose} className="bg-slate-600 hover:bg-slate-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default CredentialsManager;