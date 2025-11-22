import React, { useMemo, useState } from 'react';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  payload: any | null;
};

const badgeClass = (status: string) =>
  status === 'ok'
    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
    : status === 'warning' || status === 'warn'
    ? 'bg-amber-500/15 text-amber-200 border border-amber-500/40'
    : 'bg-rose-500/15 text-rose-200 border border-rose-500/40';

const HealthDetailModal: React.FC<Props> = ({ isOpen, onClose, payload }) => {
  const [running, setRunning] = useState(false);
  const [diag, setDiag] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const agentJson = useMemo(() => {
    const a = payload?.agentSummary || null;
    try { return a ? JSON.stringify(a, null, 2) : '{}'; } catch { return '{}'; }
  }, [payload]);

  if (!isOpen) return null;

  const status = (payload?.status || 'warning').toLowerCase();
  const summary = payload?.summary || 'No summary';
  const description = payload?.description || '';
  const remediation: string[] = Array.isArray(payload?.remediation) ? payload.remediation : [];

  async function copyAgent() {
    try { await navigator.clipboard.writeText(agentJson); } catch {}
  }

  async function runDiagnostics() {
    try {
      setRunning(true); setErr(null); setDiag(null);
      const configured = (window as any).__CTS_API_BASE || (import.meta as any).env?.VITE_API_BASE || '';
      const base = configured && String(configured).trim().length > 0 ? String(configured) : '/api';
      const apiRoot = base.replace(/\/$/, '');
      const cmds: string[] = (payload?.agentSummary?.suggestedCommands || []).slice(0, 5);
      const resp = await fetch(`${apiRoot}/health/run-diagnostics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ commands: cmds }),
      });
      const json = await resp.json();
      if (!resp.ok) { setErr(json?.error || `HTTP ${resp.status}`); setRunning(false); return; }
      setDiag(Array.isArray(json) ? json : []);
      setRunning(false);
    } catch (e: any) {
      setErr(String(e?.message || e));
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <div className={`px-2 py-1 text-xs rounded ${badgeClass(status)}`}>{status.toUpperCase()}</div>
          <button className="text-slate-300 text-sm hover:text-white" onClick={onClose}>Close</button>
        </div>
        <div className="px-4 py-3 space-y-3">
          <h3 className="text-slate-100 text-sm font-semibold">{summary}</h3>
          {description && <p className="text-slate-300 text-sm">{description}</p>}
          {remediation.length > 0 && (
            <div>
              <p className="text-slate-400 text-xs mb-1">Remediation</p>
              <ul className="list-disc ml-5 text-slate-200 text-sm space-y-1">
                {remediation.slice(0,3).map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={copyAgent} className="px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 rounded border border-slate-600 text-slate-100">Copy Agent JSON</button>
            <button onClick={runDiagnostics} className="px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 rounded border border-slate-600 text-slate-100" disabled={running}>
              {running ? 'Running…' : 'Run Quick Diagnostics'}
            </button>
          </div>
          {err && <div className="text-rose-300 text-xs">Diagnostics error: {err}</div>}
          {diag && diag.length > 0 && (
            <div className="max-h-48 overflow-auto border border-slate-700 rounded">
              <pre className="text-[0.7rem] text-slate-200 p-2 whitespace-pre-wrap break-words">{JSON.stringify(diag, null, 2)}</pre>
            </div>
          )}
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-slate-400">Raw Details</summary>
            <pre className="text-[0.7rem] text-slate-200 p-2 whitespace-pre-wrap break-words border border-slate-700 rounded mt-1">{JSON.stringify(payload || {}, null, 2)}</pre>
          </details>
        </div>
      </div>
    </div>
  );
};

export default HealthDetailModal;
