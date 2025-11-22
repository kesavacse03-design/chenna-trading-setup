import { useCallback, useEffect, useMemo, useState } from 'react';
import fetchWithTimeout from '../utils/fetchWithTimeout';

type Status = {
  hasToken: boolean;
  expired: boolean;
  expiresAt?: number;
  _diag?: {
    apiBase?: string;
    redirectUri?: string;
    tokensFile?: { path?: string; exists?: boolean };
    hasRefresh?: boolean;
  }
}

const getApiBase = (): string => {
  if (typeof window !== 'undefined' && (window as any).__CTS_API_BASE) return (window as any).__CTS_API_BASE;
  const env: any = (import.meta as any).env || {};
  if (env.VITE_API_BASE) return env.VITE_API_BASE;
  return '';
};

export default function UpstoxAuthWidget({ className = '' }: { className?: string }) {
  const apiBase = useMemo(() => getApiBase().replace(/\/$/, ''), []);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!apiBase) { setStatus(null); return; }
    setLoading(true); setErr(null);
      const dbg = !!localStorage.getItem('cts_debug');
      const url = `${apiBase}/auth/upstox/status?debug=1`;
      const t0 = Date.now();
    try {
        const r = await fetchWithTimeout(url, undefined, 2500);
        const t1 = Date.now();
        if (dbg) console.log('[CTS-DEBUG] GET /auth/upstox/status', { url, status: r.status, timeMs: t1-t0 });
      if (!r.ok) throw new Error(`status ${r.status}`);
      const j = await r.json();
      setStatus(j as Status);
    } catch (e: any) {
      setErr(e?.message || 'status failed');
    } finally { setLoading(false); }
  }, [apiBase]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const onLogin = useCallback(async () => {
    if (!apiBase) return;
    // Open redirector endpoint directly to avoid about:blank UX
    const url = `${apiBase}/auth/upstox/start`;
    window.open(url, '_blank', 'noopener');
    const started = Date.now();
    const timer = setInterval(async () => {
      await fetchStatus();
      const ok = (s: Status | null) => !!(s && s.hasToken && !s.expired);
      if (ok(status) || Date.now() - started > 120000) clearInterval(timer);
    }, 2500);
  }, [apiBase, fetchStatus, status]);

  const onLoginOffline = useCallback(async () => {
    if (!apiBase) return;
    const url = `${apiBase}/auth/upstox/start?offline=1`;
    window.open(url, '_blank', 'noopener');
    const started = Date.now();
    const timer = setInterval(async () => {
      await fetchStatus();
      const ok = (s: Status | null) => !!(s && s.hasToken && !s.expired && s._diag && s._diag.hasRefresh);
      if (ok(status) || Date.now() - started > 120000) clearInterval(timer);
    }, 2500);
  }, [apiBase, fetchStatus, status]);

  // visual state
  const connected = !!(status && status.hasToken && !status.expired);
  const showReauth = !!(status && (!connected || status.expired));
  const chipClass = connected
    ? 'bg-emerald-900/50 text-emerald-300 border-emerald-600/40'
    : 'bg-rose-900/40 text-rose-300 border-rose-600/40';
  const chipText = connected ? 'Upstox: Connected' : 'Upstox: Not connected';
  const tooltip = (() => {
    if (!status) return apiBase ? 'Live Mode' : 'Preview Mode';
    const expires = status.expiresAt ? new Date(status.expiresAt).toLocaleString() : 'n/a';
    const src = status?._diag?.apiBase || 'n/a';
    const hasRef = status?._diag?.hasRefresh ? 'yes' : 'no';
    return `expires: ${expires}\napi: ${src}\nrefresh: ${hasRef}`;
  })();

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <span
        title={tooltip}
        className={`text-xs px-2 py-1 rounded-full border whitespace-nowrap ${chipClass}`}
      >
        {loading ? 'Upstox: Checking…' : chipText}
      </span>
      <button
        type="button"
        onClick={onLogin}
        disabled={!apiBase}
        title={apiBase ? 'Open Upstox login flow' : 'Configure API base in .env (VITE_API_BASE)'}
        className={`text-xs px-2 py-1 rounded-md border transition-colors ${apiBase ? 'bg-slate-800/50 hover:bg-cyan-600/20 border-slate-600/60 text-slate-200' : 'bg-slate-900/40 border-slate-700/60 text-slate-500 cursor-not-allowed'}`}
      >
        Login to Upstox
      </button>
      {/* Re-authenticate button shown when token is expired */}
      {status && status.expired ? (
        <button
          type="button"
          onClick={onLogin}
          disabled={!apiBase}
          title="Token expired. Click to re-authenticate."
          className="text-xs px-2 py-1 rounded-md border bg-rose-900/40 text-rose-200 border-rose-600/40"
        >
          Re-Authenticate
        </button>
      ) : null}
      {/* If no refresh token present, show offline login option prominently */}
      {status && status._diag && !status._diag.hasRefresh ? (
        <button
          type="button"
          onClick={onLoginOffline}
          disabled={!apiBase}
          title="Request offline access (refresh token) during login"
          className="text-xs px-2 py-1 rounded-md border bg-yellow-800/30 text-yellow-200 border-yellow-600/40"
        >
          Login (offline)
        </button>
      ) : null}
      {/* Re-authenticate button when disconnected or expired */}
      {showReauth ? (
        <button
          type="button"
          onClick={onLogin}
          disabled={!apiBase}
          title="Click to re-authenticate Upstox"
          className="text-xs px-2 py-1 rounded-md border bg-rose-900/40 text-rose-200 border-rose-600/40"
        >
          Re-Authenticate
        </button>
      ) : null}
      <button
        type="button"
        onClick={fetchStatus}
        disabled={!apiBase}
        className={`text-xs px-2 py-1 rounded-md border transition-colors ${apiBase ? 'bg-slate-800/50 hover:bg-slate-700/50 border-slate-600/60 text-slate-200' : 'bg-slate-900/40 border-slate-700/60 text-slate-500 cursor-not-allowed'}`}
        title="Refresh Upstox status"
      >
        Refresh
      </button>
      {err && <span className="text-[10px] text-rose-400">{err}</span>}
      <button
        type="button"
        onClick={async () => {
          if (!apiBase) return;
          if (!confirm('Clear stored Upstox tokens? This will force a fresh login.')) return;
          try {
            // If ADMIN_API_TOKEN required, set it on the server env or call with ?token=
            await fetch(`${apiBase}/auth/upstox/clear`, { method: 'POST' });
            // refresh status and prompt offline login
            await fetchStatus();
            if (confirm('Tokens cleared. Open offline login now to obtain refresh token?')) onLoginOffline();
          } catch (e) { alert('Failed to clear tokens'); }
        }}
        className="text-xs px-2 py-1 rounded-md border bg-slate-700/30 text-slate-200"
      >
        Clear tokens
      </button>
    </div>
  );
}
