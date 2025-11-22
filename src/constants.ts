import { GroupedWatchlist, StrategyLogic } from './types';

export const FLAGS = {
  MOCK_MODE: true,                // hard-lock Preview Mode
  TELEGRAM_ENABLED: true,         // simulate Telegram locally
  TRACKING_DAYS: 10,              // swing tracking window
  PERSIST_KEY_WATCHLIST: 'cts_watchlist_store',
  PERSIST_KEY_STRATEGIES: 'cts_strategies_store',
  PERSIST_KEY_TRADES: 'cts_trades_store',
  PERSIST_KEY_NOTIFS: 'cts_notifications_store'
} as const;

export const PREPOPULATED_WATCHLIST: GroupedWatchlist = {
  "PRO_SETUP": {
  "DOWNSIDE_LOM_INTRA": [],
  "UPSIDE_LOM_INTRA": [],
  "DAILY_CONTRACTION": [],
  "PRE_MARKET": []
  },
  "SWING_CENTER": {
  "DOWNSIDE_LOM_SWING": [],
  "UPSIDE_LOM_SWING": [],
  "MULTI_RESISTANCE_BO": [],
  "MULTI_SUPPORT_BO": [],
    "SHORT_TERM_SWING_BO_UP": [],
    "SHORT_TERM_SWING_BO_DOWN": [],
    "LONG_TERM_SWING_BO_UP": [],
    "LONG_TERM_SWING_BO_DOWN": []
  },
  "MARKET_DEPTH": {
  "HIGH_POWERED_STOCKS": [],
  "INTRADAY_BOOST": []
  }
};

// Map normalized variant tokens to canonical category keys (editable)
export const CATEGORY_CANONICAL_MAP: Record<string, string> = {
  // variants mapping -> canonical category keys (used across import/sync/render)
  // normalized tokens (lowercase, underscores) -> canonical keys (as used in PREPOPULATED_WATCHLIST)
  'high_powered_stocks': 'HIGH_POWERED_STOCKS',
  'highpoweredstocks': 'HIGH_POWERED_STOCKS',
  'high_powered_stock': 'HIGH_POWERED_STOCKS',
  'highpoweredstock': 'HIGH_POWERED_STOCKS',
  'high_power_stocks': 'HIGH_POWERED_STOCKS',
  'highpowerstocks': 'HIGH_POWERED_STOCKS',
  'intraday_boost': 'INTRADAY_BOOST',
  'intradayboost': 'INTRADAY_BOOST',
  'pre_market': 'PRE_MARKET',
  'pre_marke': 'PRE_MARKET',
  'premarket': 'PRE_MARKET',
  'downside_lom_intra': 'DOWNSIDE_LOM_INTRA',
  'upside_lom_intra': 'UPSIDE_LOM_INTRA',
  'daily_contraction': 'DAILY_CONTRACTION',
  // swing aliases
  'downside_lom_swing': 'DOWNSIDE_LOM_SWING',
  'upside_lom_swing': 'UPSIDE_LOM_SWING',
  'multi_resistance_bo': 'MULTI_RESISTANCE_BO',
  'multiresistancebo': 'MULTI_RESISTANCE_BO',
  'multi_support_bo': 'MULTI_SUPPORT_BO',
  'multisupportbo': 'MULTI_SUPPORT_BO',
  'short_term_swing_bo_up': 'SHORT_TERM_SWING_BO_UP',
  'shorttermswingbo_up': 'SHORT_TERM_SWING_BO_UP',
  'short_term_swing_bo_down': 'SHORT_TERM_SWING_BO_DOWN',
  'shorttermswingbo_down': 'SHORT_TERM_SWING_BO_DOWN',
  'long_term_swing_bo_up': 'LONG_TERM_SWING_BO_UP',
  'longtermswingbo_up': 'LONG_TERM_SWING_BO_UP',
  'long_term_swing_bo_down': 'LONG_TERM_SWING_BO_DOWN',
  'longtermswingbo_down': 'LONG_TERM_SWING_BO_DOWN',
  // no TOP_LEVEL fallback; require explicit category selection
};

export const SWING_TRADE_CATEGORIES = new Set([
  "UPSIDE_LOM_SWING",
  "DOWNSIDE_LOM_SWING",
  "MULTI_SUPPORT_BO",
  "MULTI_RESISTANCE_BO",
  "SHORT_TERM_SWING_BO_UP",
  "SHORT_TERM_SWING_BO_DOWN",
  "LONG_TERM_SWING_BO_UP",
  "LONG_TERM_SWING_BO_DOWN"
]);

export const DEFAULT_STRATEGY_LOGIC: StrategyLogic = {
  description: "A universal momentum and mean-reversion strategy that serves as a baseline. It identifies breakouts from consolidation patterns, confirmed by volume, while also looking for over-extended moves that are likely to revert to their mean.",
  rules: [
    "For bullish setups, the price must be above its 20-period and 50-period moving averages.",
    "For bearish setups, the price must be below its 20-period and 50-period moving averages.",
    "A breakout or breakdown must be accompanied by a significant increase in volume (at least 1.5x the average of the last 20 periods).",
    "The Relative Strength Index (RSI 14) should support the move (e.g., above 50 for bullish, below 50 for bearish) but not be excessively overbought (>80) or oversold (<20) to avoid exhaustion risk.",
    "The entry should be near a clear structural level (support/resistance). The stop-loss should be placed on the opposite side of this structure."
  ]
};


