import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import CategoryController from './components/CategoryController';
import TradingDashboard from './components/TradingDashboard';
import AnalysisHub from './components/AnalysisHub';
import { Trade, Notification as NotificationType, SystemHealthState, GroupedWatchlist, StrategyState, StrategyLogic, ImportWatchlistPayload } from './types';
import CredentialsManager from './components/CredentialsManager';
import TradeJournal from './components/TradeJournal';
import { CogIcon } from './components/icons/CogIcon';
import StrategyWorkbenchSimple from './components/StrategyWorkbenchSimple';
import * as api from './api';
import { startTicker, stopTicker } from './utils/ticker';
import { runSyncQueue } from './utils/sync';
import { normalizeAndMapCategory, migrateLocalStorageAddCategoryMeta } from './utils/categoryMap';
import { PREPOPULATED_WATCHLIST, DEFAULT_STRATEGY_LOGIC } from './constants';
import { LabsWorkflowWindow } from './components/LabsWorkflowWindow';
import { useSignalNotifications } from './hooks/useSignalNotifications';

// Lazy-load Upstox auth widget
const UpstoxAuthWidget = React.lazy(() => import('./components/UpstoxAuthWidget'));

// Market Sentiment Component removed (legacy)
// System Log Component removed (legacy)

const App: React.FC = () => {
  // ========== STATE MANAGEMENT ==========
  const [trades, setTrades] = useState<Trade[]>([]);
  const [completedTrades, setCompletedTrades] = useState<Trade[]>([]);
  const [watchlist, setWatchlist] = useState<GroupedWatchlist>(PREPOPULATED_WATCHLIST);
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [notificationMessage, setNotificationMessage] = useState("System Initialized.");
  const [healthState, setHealthState] = useState<SystemHealthState | null>(null);
  const [strategyState, setStrategyState] = useState<StrategyState>({});

  // View State: 'trading' | 'watchlist' | 'categories' | 'journal'
  const [activeView, setActiveView] = useState<'trading' | 'watchlist' | 'categories' | 'journal'>('trading');

  // Browser notifications: sound + popup when new signals arrive
  useSignalNotifications(true);

  // Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWorkbenchOpen, setIsWorkbenchOpen] = useState(false);
  const [isLabsOpen, setIsLabsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // Loading State
  const [isLoading, setIsLoading] = useState(true);

  // ========== DATA HYDRATION & SIMULATION TICKER ==========
  const refreshAllStateFromStorage = useCallback(async () => {
    setWatchlist(await api.getWatchlist());
    setStrategyState(await api.getStrategies());
    setTrades(await api.getActiveTrades());
    setCompletedTrades(await api.getCompletedTrades());
    setNotifications(await api.getNotifications());
    setHealthState(await api.getHealth());
  }, []);

  useEffect(() => {
    const initialize = async () => {
      const timeout = new Promise<void>(resolve => setTimeout(resolve, 2500));
      try {
        await Promise.race([
          (async () => { await refreshAllStateFromStorage(); })(),
          timeout,
        ]);
      } catch (e) {
        console.warn('Startup hydrate failed; continuing in preview mode', e);
      }

      // Run canonical migration
      try { migrateLocalStorageAddCategoryMeta(); } catch (_) { }

      // One-time migration for cts_stocks
      try {
        const raw = localStorage.getItem('cts_stocks');
        if (raw) {
          const list = JSON.parse(raw);
          let changed = false;
          for (const it of list) {
            if (!it.categoryRaw || !it.categoryKey) {
              const { categoryKey, categoryRaw } = normalizeAndMapCategory(it.category || it.categoryRaw || '');
              it.categoryRaw = it.categoryRaw || categoryRaw;
              it.categoryKey = it.categoryKey || categoryKey;
              changed = true;
            }
          }
          if (changed) {
            try { localStorage.setItem('cts_stocks', JSON.stringify(list)); } catch (_) { }
          }
        }
      } catch (e) { console.warn('Migration failed', e); }

      // Background sync
      try {
        window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: 'Reconciling pending changes…', kind: 'info' } }));
        void runSyncQueue((m, k) => {
          window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: m, kind: k } }));
        }).catch(() => {
          window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: 'Background sync encountered an error', kind: 'error' } }));
        });
      } catch (_) { }

      // Log system initialized
      window.dispatchEvent(new CustomEvent('cts:log', { detail: { message: 'System initialized', type: 'success' } }));

      setIsLoading(false);
    };

    initialize();

    const onApiChanged = () => { void refreshAllStateFromStorage(); };
    window.addEventListener('cts:api-changed', onApiChanged as EventListener);

    const tickerCallback = async () => {
      await api.evaluateOpenTradesAndNotify();
      setTrades(await api.getActiveTrades());
      setCompletedTrades(await api.getCompletedTrades());
      setNotifications(await api.getNotifications());
    };

    setTimeout(() => startTicker(tickerCallback, 3500), 500);

    return () => {
      stopTicker();
      window.removeEventListener('cts:api-changed', onApiChanged as EventListener);
    };
  }, [refreshAllStateFromStorage]);

  // ========== EVENT HANDLERS ==========
  const handleWatchlistUpdate = async (payload: ImportWatchlistPayload) => {
    try {
      const result = await api.importWatchlist(payload);
      setNotificationMessage(result.message);
      setWatchlist(await api.getWatchlist());
      window.dispatchEvent(new CustomEvent('cts:log', { detail: { message: 'Watchlist updated successfully', type: 'success' } }));
    } catch (error: any) {
      setNotificationMessage(`Import failed: ${error.message}`);
      window.dispatchEvent(new CustomEvent('cts:log', { detail: { message: `Import failed: ${error.message}`, type: 'error' } }));
    }
  };

  const handleManageStrategy = (categoryKey: string) => {
    setSelectedCategory(categoryKey);
    setIsWorkbenchOpen(true);
  };

  const handleOpenLabs = (categoryKey: string) => {
    setSelectedCategory(categoryKey);
    setIsLabsOpen(true);
    window.dispatchEvent(new CustomEvent('cts:log', { detail: { message: `Labs opened for ${categoryKey}`, type: 'info' } }));
  };

  const handleSaveStrategy = async (categoryKey: string, newLogic: StrategyLogic) => {
    const newStrategies = await api.saveStrategy(categoryKey, newLogic);
    setStrategyState(newStrategies);
    setNotificationMessage(`Strategy for ${categoryKey} saved.`);
    window.dispatchEvent(new CustomEvent('cts:log', { detail: { message: `Strategy saved for ${categoryKey}`, type: 'success' } }));
  };

  // ========== RENDER ==========
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-cyan-400">
        Loading Chenna Trading System...
      </div>
    );
  }

  const apiBase = (window as any).__CTS_API_BASE || (import.meta as any).env?.VITE_API_BASE || '';

  const bannerText = (() => {
    if (!apiBase) return 'Preview Mode: all data simulated. No network calls are made.';
    if (!healthState) return 'Live Mode (initializing)';
    const up = healthState.components.find(c => c.service === 'Upstox API');
    if (up && up.status === 'ok') return 'Live Mode active';
    if (up && up.status === 'error') return 'Live Mode (Upstox disconnected)';
    return 'Live Mode (partial)';
  })();

  return (
    <>
      <div className="hidden">
        <b>{bannerText}</b>
      </div>
      {/* NotificationBar removed - not useful */}

      <div className="min-h-screen p-4 sm:p-6 lg:p-8">
        {/* Header with Navigation */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4">
            <Header />
            {/* Navigation Tabs */}
            <div className="flex gap-2 ml-8">
              <button
                onClick={() => setActiveView('trading')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeView === 'trading'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
              >
                🎯 Trading Dashboard
              </button>
              <button
                onClick={() => setActiveView('watchlist')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeView === 'watchlist'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
              >
                📊 Watchlist & Analysis
              </button>
              <button
                onClick={() => setActiveView('journal')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeView === 'journal'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
              >
                📓 Trade Journal
              </button>
            </div>
            <div className="flex gap-2 ml-4">
              <button
                onClick={() => setActiveView('categories')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeView === 'categories'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
              >
                🎛️ Controller
              </button>
            </div>
          </div>

          <div className="flex space-x-2 items-center">
            <span className={`px-3 py-1 text-xs font-medium rounded-full ${apiBase ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'}`}>{apiBase ? '🟢 Live' : '⚪ Preview'}</span>
            {apiBase ? (
              <React.Suspense fallback={<span className="text-xs text-slate-500">Upstox…</span>}>
                <UpstoxAuthWidget />
              </React.Suspense>
            ) : null}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 bg-slate-800/50 hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-300 rounded-full transition-colors"
              title="Settings"
            >
              <CogIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Content */}
        {activeView === 'trading' && (
          /* TRADING DASHBOARD VIEW */
          <main className="grid grid-cols-1 gap-4">
            <div className="col-span-1">
              <TradingDashboard />
            </div>
          </main>
        )}

        {activeView === 'journal' && (
          <main>
            <TradeJournal />
          </main>
        )}

        {activeView === 'watchlist' && (
          /* WATCHLIST & ANALYSIS VIEW */
          <main>
            <AnalysisHub
              watchlist={watchlist}
              onWatchlistUpdate={handleWatchlistUpdate}
              onManageStrategy={handleManageStrategy}
              onOpenLabs={handleOpenLabs}
            />
          </main>
        )}

        {activeView === 'categories' && (
          <main>
            <CategoryController />
          </main>
        )}
      </div>

      {/* Modals */}
      <CredentialsManager isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {isWorkbenchOpen && (
        <StrategyWorkbenchSimple
          isOpen={isWorkbenchOpen}
          onClose={() => setIsWorkbenchOpen(false)}
          categoryKey={selectedCategory}
          initialLogic={strategyState[selectedCategory]?.[0]?.logic || DEFAULT_STRATEGY_LOGIC}
          onSaveStrategy={handleSaveStrategy}
        />
      )}

      {isLabsOpen && (
        <LabsWorkflowWindow
          isOpen={isLabsOpen}
          onClose={() => setIsLabsOpen(false)}
          categoryKey={selectedCategory}
        />
      )}
    </>
  );
};

export default App;