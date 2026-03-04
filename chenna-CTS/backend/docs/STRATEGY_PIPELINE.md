# CTS STRATEGY IMPLEMENTATION PIPELINE

**Version:** 1.0  
**Last Updated:** 2026-01-22

This document defines the EXACT steps to implement a strategy for ANY category. Follow these steps IN ORDER.

## THE PIPELINE (Same for ALL categories)

```
[STEP 1] Create Strategy File
         ↓
[STEP 2] Register in strategyManager.cjs
         ↓
[STEP 3] Connect to Backtest Engine
         ↓
[STEP 4] Connect to Signal Generator (Live)
         ↓
[STEP 5] Connect to Scanner
         ↓
[STEP 6] Verify UI Displays Correctly
         ↓
[STEP 7] Run Time-Travel Backtest
         ↓
[STEP 8] Analyze & Refine
         ↓
[STEP 9] Final Audit
         ↓
[STEP 10] PRODUCTION READY ✅
```

---

## STEP 1: CREATE STRATEGY FILE

**Location:** `backend/strategies/[categoryName]Strategy.cjs`

**Template:**

```javascript
// [categoryName]Strategy.cjs
// Strategy for [CATEGORY_KEY] category
// Created: [DATE]
// Version: 1.0

const CONFIG = {
  name: '[Strategy Name]',
  displayName: '[Display Name for UI]',
  category: '[CATEGORY_KEY]',
  direction: 'LONG' | 'SHORT',
  timeframe: '1minute' | '3minute' | '5minute' | 'daily',
  
  // Entry conditions
  entry: {
    // Define entry logic
  },
  
  // Exit conditions
  exit: {
    targetPercent: 1.5,    // Take profit %
    stopPercent: 1.0,      // Stop loss %
    timeExit: '15:15',     // Time-based exit (for intraday)
    maxHoldDays: 1,        // Max holding period
  },
  
  // Filters
  filters: {
    // Define filters
  },
  
  // Rules for UI display
  rules: [
    'Rule 1 description',
    'Rule 2 description',
  ]
};

/**
 * Generate trading signal for a stock
 * @param {string} symbol - Stock symbol
 * @param {Array} ohlcData - OHLC candle data
 * @param {Object} context - Additional context (date, market data)
 * @returns {Object|null} - Signal object or null if no signal
 */
async function generateSignal(symbol, ohlcData, context = {}) {
  // Implement strategy logic here
  
  // Return signal object if conditions met
  return {
    symbol,
    category: CONFIG.category,
    strategy: CONFIG.name,
    direction: CONFIG.direction,
    entryPrice: 0,
    targetPrice: 0,
    stopPrice: 0,
    reason: 'Signal reason',
    confidence: 0.8,
    timestamp: new Date().toISOString()
  };
  
  // Return null if no signal
  return null;
}

/**
 * Get strategy configuration
 * @returns {Object} - Strategy config for UI and backtest
 */
function getConfig() {
  return CONFIG;
}

module.exports = {
  generateSignal,
  getConfig,
  CONFIG
};
```

**Output:** One .cjs file with `generateSignal()` and `getConfig()` functions

---

## STEP 2: REGISTER IN STRATEGY MANAGER

**File:** `backend/services/labs/strategyManager.cjs`

Add entry to `STRATEGY_CONFIG` object:

```javascript
const STRATEGY_CONFIG = {
  // ... existing entries ...
  
  '[CATEGORY_KEY]': {
    // Strategy reference
    strategy: require('./[categoryName]Strategy'),
    
    // Display info
    name: '[Strategy Name]',
    displayName: '[Display Name]',
    description: '[Short description]',
    
    // Trading params
    direction: 'LONG' | 'SHORT',
    type: 'INTRADAY' | 'SWING',
    timeframe: '1minute' | '5minute' | 'daily',
    
    // Risk params
    targetPercent: 1.5,
    stopPercent: 1.0,
    maxHoldDays: 1,
    
    // Schedule
    validDays: [1, 2, 3, 4, 5],  // Mon-Fri
    entryStartTime: '09:20',
    entryEndTime: '14:00',
    exitTime: '15:15',
    
    // Status
    enabled: true,
    status: 'active',
    
    // UI display
    rules: [
      'Rule 1',
      'Rule 2',
    ],
    
    // Backtest stats (update after validation)
    backtestedWinRate: null,
    backtestedTrades: null,
  },
};
```

**Verify:** `getStrategyConfig('[CATEGORY_KEY]')` returns the config

---

## STEP 3: CONNECT TO BACKTEST ENGINE

**File:** `backend/services/labs/backtestEngine.cjs`

The backtest engine should ALREADY use strategyManager. Verify this code exists:

```javascript
const strategyManager = require('./strategyManager.cjs');

async function runBacktest(categoryKey, startDate, endDate, config) {
  // Get strategy config from strategyManager
  const strategyConfig = strategyManager.getStrategyConfig(categoryKey);
  
  if (!strategyConfig) {
    throw new Error(`Strategy not configured for: ${categoryKey}`);
  }
  
  // Use strategy's generateSignal function
  const { strategy } = strategyManager.getStrategy(categoryKey);
  
  // ... backtest loop using strategy.generateSignal() ...
}
```

**NO CHANGES NEEDED** if architecture is correct. Just verify the category is recognized.

---

## STEP 4: CONNECT TO SIGNAL GENERATOR (LIVE)

**File:** `backend/services/labs/signalGeneratorV2.cjs`

The signal generator should ALREADY use strategyManager. Verify this code exists:

```javascript
const strategyManager = require('./strategyManager.cjs');

async function generateSignalsForCategory(categoryKey, stocks) {
  const strategyConfig = strategyManager.getStrategyConfig(categoryKey);
  const { strategy } = strategyManager.getStrategy(categoryKey);
  
  for (const stock of stocks) {
    const signal = await strategy.generateSignal(stock.symbol, ohlcData, context);
    if (signal) {
      signals.push(signal);
    }
  }
  
  return signals;
}
```

**NO CHANGES NEEDED** if architecture is correct.

---

## STEP 5: CONNECT TO SCANNER

**File:** `backend/scripts/scheduledScanner.cjs`

Verify category is in the scan list:

```javascript
// Categories to scan
const INTRADAY_CATEGORIES = [
  'INTRADAY_BOOST',
  'HIGH_POWERED_STOCKS',
  'PRE_MARKET',           // <-- Ensure your category is here
  'UPSIDE_LOM_INTRA',
  'DOWNSIDE_LOM_INTRA',
];

const SWING_CATEGORIES = [
  'DAILY_CONTRACTION',
  'MULTI_RESISTANCE_BO',
  // ... etc
];
```

**If category is missing** → ADD IT to appropriate list

---

## STEP 6: VERIFY UI DISPLAYS CORRECTLY

**File:** `frontend/src/components/TimeTravelBacktestModal.tsx`

The UI should fetch strategy info from API:
- `GET /api/strategy/info/:categoryKey`

**Verify API returns correct data:**
```bash
curl http://localhost:3001/api/strategy/info/PRE_MARKET
```

**Expected response:**
```json
{
  "name": "Gap Up Short (Gap Fill)",
  "direction": "SHORT",
  "rules": ["Rule 1", "Rule 2"],
  "targetPercent": 3.0,
  "stopPercent": 2.0
}
```

**UI should display:**
- Strategy name
- Direction (LONG/SHORT)
- Rules list
- Target/Stop info
- NO "default rules" warning

---

## STEP 7: RUN TIME-TRAVEL BACKTEST

1. Open UI: Time-Travel Backtest
2. Select category
3. Set date range (with available data)
4. Click "Start Time-Travel Backtest"

**Verify:**
- Progress bar moves
- Completes without errors
- Results display (trades, win rate, P&L)
- CSV can be downloaded

**If errors** → Debug and fix before proceeding

---

## STEP 8: ANALYZE & REFINE

After backtest:

1. Download CSV
2. Verify no duplicate entries (one stock per day max)
3. Check win rate is acceptable (>50%)
4. Analyze losing trades - WHY did they fail?
5. Identify filters to add
6. Update strategy file with refinements
7. Re-run backtest
8. Repeat until win rate is acceptable

**Document findings in:**  
`backend/audits/[CATEGORY_KEY]_analysis.md`

---

## STEP 9: FINAL AUDIT

Complete the audit checklist:

- [ ] Strategy file exists and exports correctly
- [ ] Registered in strategyManager.cjs
- [ ] Backtest engine uses strategy
- [ ] Signal generator uses strategy
- [ ] Scanner includes category
- [ ] UI displays strategy info correctly
- [ ] Backtest runs without errors
- [ ] Backtest results are reasonable
- [ ] CSV has no duplicates
- [ ] Other categories still work (isolation test)

**Create audit file:**  
`backend/audits/[CATEGORY_KEY]_audit.json`

---

## STEP 10: PRODUCTION READY

After all steps pass:
- Mark category as `PRODUCTION_READY` in audit
- Update `backtestedWinRate` in strategyManager
- Move to next category

**DO NOT proceed to next category until current one is complete!**

---

## FILE REFERENCE - WHAT EACH FILE DOES

### Strategy Files
```
backend/services/labs/
├── strategyManager.cjs          # CENTRAL CONFIG - All categories
├── intradayStrategyV2_1.cjs     # INTRADAY_BOOST, HIGH_POWERED
├── preMarketStrategy.cjs        # PRE_MARKET
├── dailyContractionStrategy.cjs # DAILY_CONTRACTION
├── upsideLomIntraStrategy.cjs   # UPSIDE_LOM_INTRA
├── downsideLomIntraStrategy.cjs # DOWNSIDE_LOM_INTRA
└── ... (one file per unique strategy)
```

### Engine Files
```
backend/services/labs/
├── backtestEngine.cjs       # Time-Travel Backtest logic
└── signalGeneratorV2.cjs    # Live signal generation
```

### Scanner
```
backend/scripts/
└── scheduledScanner.cjs     # Runs during market hours
```

### API Routes
```
backend/api/
└── backtestRoutes.cjs       # /api/backtest/* endpoints
```

### Frontend
```
src/components/
└── TimeTravelBacktestModal.tsx  # Backtest UI
```

---

## EXAMPLE: Adding a NEW category (EXAMPLE_CATEGORY)

1. **Create** `backend/services/labs/exampleStrategy.cjs`
2. **Add** to `strategyManager.cjs` STRATEGY_CONFIG
3. **Verify** backtest engine imports from strategyManager (no change needed)
4. **Verify** signal generator imports from strategyManager (no change needed)  
5. **Add** `'EXAMPLE_CATEGORY'` to `scheduledScanner.cjs`
6. **Verify** UI fetches `/api/strategy/info/EXAMPLE_CATEGORY`
7. **Run** backtest
8. **Analyze** and refine
9. **Complete** audit
10. **Mark** PRODUCTION_READY

**THAT'S IT!** Same steps for every category.

---

## WHAT CHANGES vs WHAT STAYS SAME

### Changes Per Category (Unique)
- Strategy file content (entry/exit logic)
- Rules description
- Direction (LONG/SHORT)
- Timeframe
- Target/Stop percentages

### Stays Same (Pipeline)
- Where to register (strategyManager.cjs)
- How backtest engine works
- How signal generator works
- How scanner works
- UI components
- API endpoints

**Think of it like a factory:**
- Each category = different product
- Factory process = same pipeline
- Just change the "recipe" (strategy file)
