import React, { useEffect, useState } from 'react';
import HealthDetailModal from './HealthDetailModal';
import { STAGES as DEFAULT_STAGES } from '../utils/healthHelpers';

type HealthCheck = {
  id: string;
  name: string;
  ok: boolean;
  status: 'ok' | 'warn' | 'error' | string;
  detail?: any;
  hint?: string;
};

type HealthApiResponse = {
  ok: boolean;
  timestamp: string;
  checks: Record<string, HealthCheck>;
};

// Lightweight client for the new /api/health endpoint
async function fetchHealth(): Promise<HealthApiResponse | null> {
  try {
    const configured = (window as any).__CTS_API_BASE || (import.meta as any).env?.VITE_API_BASE || '';
    const base = configured && String(configured).trim().length > 0 ? String(configured) : '/api';
    const apiRoot = base.replace(/\/$/, '');
    // Prefer the structured health endpoint
    let resp = await fetch(`${apiRoot}/health`, { credentials: 'include' });
    // If proxy base is '/api', the structured endpoint is '/api/health'; if configured is full base, it's '<base>/api/health'
    // Try both paths to be safe across setups.
    if (!resp.ok) {
      const alt = await fetch(`${apiRoot}/api/health`, { credentials: 'include' }).catch(() => null);
      if (alt && alt.ok) resp = alt as Response;
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    // If backend returned the basic /health shape, synthesize a checks map for display
    if (json && !json.checks && (json.status || json.version)) {
      const now = new Date().toISOString();
      const checks = {
        backend_alive: {
          id: 'backend_alive',
          name: 'Backend process',
          ok: true,
          status: 'ok',
          detail: { version: json.version, uptimeSec: json.uptimeSec },
          hint: 'Backend running; structured /api/health not available.'
        }
      } as Record<string, HealthCheck>;
      return { ok: true, timestamp: now, checks };
    }
    return json as HealthApiResponse;
  } catch (e) {
    console.warn('HealthMap: fetch failed', e);
    return null;
  }
}

const statusColor: Record<string, string> = {
  ok: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
  warn: 'bg-amber-500/10 text-amber-200 border-amber-400/40',
  error: 'bg-rose-500/10 text-rose-200 border-rose-400/40',
};

const HealthMap: React.FC = () => {
  const [health, setHealth] = useState<HealthApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [activeDetail, setActiveDetail] = useState<any | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  async function fetchDetail(component: string, checkId?: string) {
    try {
      const configured = (window as any).__CTS_API_BASE || (import.meta as any).env?.VITE_API_BASE || '';
      const base = configured && String(configured).trim().length > 0 ? String(configured) : '/api';
      const apiRoot = base.replace(/\/$/, '');
      const url = `${apiRoot}/health/detail?component=${encodeURIComponent(component)}${checkId ? `&check=${encodeURIComponent(checkId)}` : ''}`;
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      setActiveDetail(json);
      setDetailOpen(true);
    } catch (e) {
      setActiveDetail({ error: String((e as any)?.message || e) });
      setDetailOpen(true);
    }
  }

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const data = await fetchHealth();
      if (!cancelled) {
        setHealth(data);
        setLoading(false);
      }
    };

    void load();
    const id = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (!health || !health.checks) {
    return (
      <div className="p-4 rounded-lg bg-slate-900/70 border border-slate-700 text-slate-300 text-sm">
        {loading ? 'Loading health map…' : 'Health map unavailable (backend not configured or endpoint missing).'}
      </div>
    );
  }

  const checksArray = Object.values(health.checks || {});
  const byId: Record<string, HealthCheck | undefined> = {};
  for (const c of checksArray) byId[c.id] = c;

  const stages: { id: string; label: string; checkIds: string[] }[] = DEFAULT_STAGES.map(s => ({ id: s.id, label: s.label, checkIds: s.checks }));

  const overallStatus: 'ok' | 'warn' | 'error' = health.ok
    ? (checksArray.some(c => c.status === 'warn' || (!c.ok && c.status !== 'error')) ? 'warn' : 'ok')
    : 'error';

  const toggle = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <>
    <div className="p-4 rounded-lg bg-slate-900/70 border border-slate-700 text-sm space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">System Health Map</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Health snapshot  updated {new Date(health.timestamp || Date.now()).toLocaleTimeString()}
          </p>
        </div>
        <div className={`px-2 py-1 rounded-full text-[0.65rem] border ${statusColor[overallStatus] || 'bg-slate-800/80 text-slate-200 border-slate-600'}`}>
          Overall: {overallStatus.toUpperCase()}
        </div>
      </div>
      <div className="space-y-3">
        {stages.map(stage => {
          const stageChecks = stage.checkIds.map(id => byId[id]).filter(Boolean) as HealthCheck[];
          if (!stageChecks.length) return null;
          const worst = stageChecks.some(c => c.status === 'error' || !c.ok)
            ? 'error'
            : stageChecks.some(c => c.status === 'warn')
              ? 'warn'
              : 'ok';

          return (
            <div key={stage.id} className="border border-slate-700/70 rounded-md bg-slate-950/50">
              <button
                type="button"
                onClick={() => toggle(stage.id)}
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-800/70"
              >
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                    worst === 'ok' ? 'bg-emerald-400' : worst === 'warn' ? 'bg-amber-400' : 'bg-rose-400'
                  }`} />
                  <span className="text-xs font-medium text-slate-100">{stage.label}</span>
                </div>
                <span className="text-[0.6rem] uppercase tracking-wide text-slate-400">
                  {expanded[stage.id] ? 'Hide' : 'Show'} details
                </span>
              </button>

              {expanded[stage.id] && (
                <div className="px-3 pb-3 pt-1 space-y-2">
          {stageChecks.map(check => (
                    <div
                      key={check.id}
            className={`px-2 py-2 rounded border text-[0.7rem] ${statusColor[check.status] || 'bg-slate-800/60 border-slate-600 text-slate-200'} cursor-pointer`}
            onClick={() => fetchDetail(stage.id, check.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{check.name}</span>
                        <span className="uppercase tracking-wide text-[0.6rem] opacity-80">{check.status}</span>
                      </div>
                      {check.detail && (
                        <pre className="mt-1 text-[0.6rem] leading-snug text-slate-200 whitespace-pre-wrap break-words max-h-32 overflow-auto">
                          {JSON.stringify(check.detail, null, 2)}
                        </pre>
                      )}
                      {check.hint && (
                        <p className="mt-1 text-[0.6rem] text-amber-200/90">
                          Hint: {check.hint}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Optional static SVG fallback */}
      <div className="mt-2 border-t border-slate-700/60 pt-2 space-y-2">
        <p className="text-[0.65rem] text-slate-500">Static diagram (reference):</p>
        <img src="/health-template.svg" alt="CTS Health Flow" className="w-full max-h-64 object-contain border border-slate-700/60 rounded" />
      </div>
  </div>
  <HealthDetailModal
      isOpen={detailOpen}
      onClose={() => setDetailOpen(false)}
      payload={activeDetail}
    />
  </>
  );
};

export default HealthMap;
