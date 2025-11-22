import React from 'react';
import ReactDOM from 'react-dom/client';
// apply persisted API base (if user saved it in Settings) before app mounts
try {
  const stored = localStorage.getItem('cts_api_base');
  const mode = localStorage.getItem('cts_mode') || (stored ? 'live' : 'preview');
  (window as any).__CTS_API_BASE = mode === 'live' && stored ? stored : '';
} catch (_) {}

import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);