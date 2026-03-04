const fs = require('fs');
const path = 'd:\\chenna-trading-system-dashboard\\src\\components\\TimeTravelBacktestModal.tsx';

// 1. Read Current File
const currentContent = fs.readFileSync(path, 'utf8');
const lines = currentContent.split('\n');

// 2. Find Split Points
// Header ends at line 681 (approx). Look for the close of handleBacktest
let headEndIdx = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '};' && lines[i - 1].includes('setLoading(false)')) {
        headEndIdx = i;
        break;
    }
}

// Tail starts at "{/* Date Range */}"
let tailStartIdx = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('{/* Date Range */}')) {
        tailStartIdx = i;
        break;
    }
}

if (headEndIdx === -1 || tailStartIdx === -1) {
    console.error(`Could not find split points. Head request: ${headEndIdx}, Tail: ${tailStartIdx}`);
    process.exit(1);
}

// 3. Construct "Middle" Content (Restoring from previous known good state)
const middleContent = `
    // Dynamic Strategy Rules Helper
    const getStrategyRules = (category: string) => {
        switch (category) {
            case 'DOWNSIDE_LOM_SWING':
                return {
                    title: '📉 STRATEGY: Swing Bearish Divergence',
                    rules: [
                        { icon: '📉', text: 'Daily RSI(14) Bearish Divergence (Price HH, RSI LH)' },
                        { icon: '📅', text: 'Entry on Thu/Fri only (Swing Setup)' },
                        { icon: '⚠️', text: 'RSI < 60 at High (Avoid strong momentum)' },
                        { icon: '🛑', text: 'Stop above divergence high' }
                    ],
                    color: 'red'
                };
            case 'SHORT_TERM_SWING_BO_UP':
                return {
                    title: '🚀 STRATEGY: Short-Term Breakout',
                    rules: [
                        { icon: '📈', text: 'Breakout above 5-Day High' },
                        { icon: '📊', text: 'Volume > 1.3x Average (20-day)' },
                        { icon: '📅', text: 'Entry on Thu/Fri only' },
                        { icon: '🎯', text: 'Target +2.0% | Stop -1.5%' }
                    ],
                    color: 'green'
                };
            case 'SHORT_TERM_SWING_BO_DOWN':
                return {
                    title: '📉 STRATEGY: Short-Term Breakdown',
                    rules: [
                        { icon: '📉', text: 'Breakdown below 5-Day Low' },
                        { icon: '📊', text: 'Volume > 1.3x Average (20-day)' },
                        { icon: '📅', text: 'Entry on Thu/Fri only' },
                        { icon: '🎯', text: 'Target -2.0% | Stop +1.5%' }
                    ],
                    color: 'red'
                };
            case 'LONG_TERM_SWING_BO_UP':
                return {
                    title: '🚀 STRATEGY: Long-Term Breakout',
                    rules: [
                        { icon: '📈', text: 'Breakout above 20-Day High' },
                        { icon: '📊', text: 'Volume > 1.5x Average' },
                        { icon: '📅', text: 'Entry on Thu/Fri only' },
                        { icon: '🎯', text: 'Target +4.0% | Stop -2.0%' }
                    ],
                    color: 'green'
                };
            case 'LONG_TERM_SWING_BO_DOWN':
                return {
                    title: '📉 STRATEGY: Long-Term Breakdown',
                    rules: [
                        { icon: '📉', text: 'Breakdown below 20-Day Low' },
                        { icon: '📉', text: 'Pre-Trend < -5% (Established Downtrend)' },
                        { icon: '📊', text: 'Volume > 1.5x Average' },
                        { icon: '🎯', text: 'Target -4.0% | Stop +2.0%' }
                    ],
                    color: 'red'
                };
            case 'INTRADAY_BOOST':
            case 'HIGH_POWERED_STOCKS':
                return {
                    title: '⚡ STRATEGY: Intraday N-Pattern',
                    rules: [
                        { icon: '📊', text: 'Opening Range (9:15-9:30) < 2% Width' },
                        { icon: '🔄', text: 'Pullback (Higher Low) above OR Low' },
                        { icon: '🚀', text: 'Breakout above OR High + Volume > 2x' },
                        { icon: '⚡', text: 'Intraday Only (Exit 3:15 PM)' }
                    ],
                    color: 'purple'
                };
            case 'PRE_MARKET':
                return {
                    title: '🌅 STRATEGY: Gap Up Short (Gap Fill)',
                    rules: [
                        { icon: '📈', text: 'Gap Up ≥ 3% vs Prev Close' },
                        { icon: '📉', text: 'Break below Opening Range Low' },
                        { icon: '📊', text: 'Volume > 2x at Breakdown' },
                        { icon: '🎯', text: 'Target: Gap Fill (Prev Close)' }
                    ],
                    color: 'orange'
                };
            default:
                 return {
                    title: \`📋 STRATEGY: \${selectedCategory.replace(/_/g, ' ')}\`,
                    rules: [
                        { icon: '✓', text: 'Check if trading day (Thu/Fri only)' },
                        { icon: '✓', text: 'Check price tier & candle pattern' },
                        { icon: '✓', text: 'Technical validation (Support/Resist)' },
                        { icon: '✓', text: 'Generate signal if conditions pass' }
                    ],
                    color: 'blue'
                };
        }
    };

    const resetModal = () => {
        setPhase('select');
        setSelectedCategory('');
        setStrategyConfig(null);
        setBacktestId(null);
        setProgress(null);
        setResults(null);
        setError(null);
        setDataAvailability(null);
        setShowTradeLog(false);
    };

    if (!isOpen) return null;

    const activeRules = getStrategyRules(selectedCategory);

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-slate-800 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-cyan-400">
                        ⏱️ Time-Travel Backtest
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl">&times;</button>
                </div>

                {error && (
                    <div className="bg-red-900/30 border border-red-500/40 rounded-lg p-3 mb-4 text-red-400">
                        ❌ {error}
                    </div>
                )}

                {/* Phase 1: Category Selection */}
                {phase === 'select' && (
                    <div className="space-y-4">
                        <p className="text-slate-400 text-sm mb-4">
                            Select a category to backtest. The system will simulate trading day-by-day using historical data.
                        </p>

                        <div className="grid grid-cols-1 gap-3">
                            {categories.map(cat => (
                                <button
                                    key={cat.key}
                                    onClick={() => handleCategorySelect(cat.key)}
                                    className="flex justify-between items-center p-4 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg border border-slate-600 hover:border-cyan-500 transition-all text-left"
                                >
                                    <div>
                                        <div className="font-semibold text-white">{cat.name}</div>
                                        <div className="text-sm text-slate-400">{cat.key}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-cyan-400 font-bold">{cat.stockCount}</div>
                                        <div className="text-xs text-slate-400">stocks</div>
                                    </div>
                                </button>
                            ))}
                        </div>

                        {categories.length === 0 && (
                            <div className="text-center py-8 text-slate-500">
                                No categories with stocks found
                            </div>
                        )}
                    </div>
                )}

                {/* Phase 2: Configuration with Strategy Logic */}
                {phase === 'config' && (
                    <div className="space-y-6">
                        {/* Selected Category */}
                        <div className="flex items-center gap-2 pb-4 border-b border-slate-600">
                            <button
                                onClick={() => setPhase('select')}
                                className="text-slate-400 hover:text-white"
                            >
                                ← Back
                            </button>
                            <span className="text-white font-semibold">
                                {categories.find(c => c.key === selectedCategory)?.name || selectedCategory}
                            </span>
                        </div>


                        {/* Strategy Rules Display */}
                        {loading ? (
                            <div className="text-center py-4 text-slate-400">Loading strategy...</div>
                        ) : ['INTRADAY_BOOST', 'HIGH_POWERED_STOCKS'].includes(selectedCategory) ? (
                            /* V2.1 N-Pattern Detection Rules for Intraday */
                            <div className="bg-purple-900/20 border border-purple-500/40 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-purple-400 mb-3">
                                    📋 STRATEGY: N-Pattern Detection (Intraday Breakout)
                                </h3>

                                {/* Entry & Exit */}
                                <div className="grid grid-cols-3 gap-4 mb-4">
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-green-400">+1.5%</div>
                                        <div className="text-xs text-slate-400">Target</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-red-400">Dynamic</div>
                                        <div className="text-xs text-slate-400">Stop (Below Pullback)</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-yellow-400">Same Day</div>
                                        <div className="text-xs text-slate-400">Max Hold</div>
                                    </div>
                                </div>

                                {/* N-Pattern Formation */}
                                <div className="mb-4 bg-slate-800/50 rounded p-3">
                                    <div className="text-xs text-cyan-400 font-semibold mb-2">📊 N-PATTERN FORMATION</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="flex items-center gap-2">
                                            <span className="text-orange-400">1️⃣</span>
                                            <span className="text-slate-300">Opening Range (9:15-9:30)</span>
                                        </div>
                                        <div className="text-slate-400">Range &lt; 2% of price</div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-orange-400">2️⃣</span>
                                            <span className="text-slate-300">Pullback Phase (15-45 min)</span>
                                        </div>
                                        <div className="text-slate-400">Higher low above OR low</div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-orange-400">3️⃣</span>
                                            <span className="text-slate-300">Breakout Entry</span>
                                        </div>
                                        <div className="text-slate-400">Above OR high + 0.5%</div>
                                    </div>
                                </div>

                                {/* Enhanced Filters */}
                                <div className="mb-4 bg-slate-800/50 rounded p-3">
                                    <div className="text-xs text-green-400 font-semibold mb-2">✅ ENHANCED FILTERS (need 2/3)</div>
                                    <div className="space-y-1 text-xs">
                                        <div className="flex justify-between">
                                            <span className="text-slate-300">EMA Crossover</span>
                                            <span className="text-slate-400">9 EMA above 21 EMA</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-300">Breakout Strength</span>
                                            <span className="text-slate-400">&gt; 0.5% above OR high</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-300">Volume Confirmation</span>
                                            <span className="text-slate-400">&gt; 2x average volume</span>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        ) : selectedCategory === 'PRE_MARKET' ? (
                            /* Gap Up Short Strategy for PRE_MARKET */
                            <div className="bg-orange-900/20 border border-orange-500/40 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-orange-400 mb-3">
                                    📋 STRATEGY: Gap Up Short (Gap Fill)
                                </h3>

                                {/* Entry & Exit */}
                                <div className="grid grid-cols-3 gap-4 mb-4">
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-green-400">Gap Fill</div>
                                        <div className="text-xs text-slate-400">Target (Prev Close)</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-red-400">OR High</div>
                                        <div className="text-xs text-slate-400">Stop (+0.3%)</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-yellow-400">10:30 AM</div>
                                        <div className="text-xs text-slate-400">Hard Exit</div>
                                    </div>
                                </div>

                                {/* Gap Trading Rules */}
                                <div className="mb-4 bg-slate-800/50 rounded p-3">
                                    <div className="text-xs text-cyan-400 font-semibold mb-2">📊 GAP FILL STRATEGY (SHORT)</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="flex items-center gap-2">
                                            <span className="text-orange-400">1️⃣</span>
                                            <span className="text-slate-300">Gap UP ≥3% at open</span>
                                        </div>
                                        <div className="text-slate-400">vs Previous Close</div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-orange-400">2️⃣</span>
                                            <span className="text-slate-300">Opening Range (1-min)</span>
                                        </div>
                                        <div className="text-slate-400">Wait for OR formation</div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-orange-400">3️⃣</span>
                                            <span className="text-slate-300">Break OR Low = SHORT</span>
                                        </div>
                                        <div className="text-slate-400">Conviction candle</div>
                                    </div>
                                </div>

                                {/* Filters */}
                                <div className="mb-4 bg-slate-800/50 rounded p-3">
                                    <div className="text-xs text-green-400 font-semibold mb-2">✅ FILTERS</div>
                                    <div className="space-y-1 text-xs">
                                        <div className="flex justify-between">
                                            <span className="text-slate-300">Gap Range</span>
                                            <span className="text-slate-400">3% - 10%</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-300">Volume at Entry</span>
                                            <span className="text-slate-400">&gt; 2x average</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-300">Breakdown Candle</span>
                                            <span className="text-slate-400">Body &gt; 50%</span>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        ) : strategyConfig ? (
                            /* V1.0 Rules for other categories */
                            <div className="bg-purple-900/20 border border-purple-500/40 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-purple-400 mb-3">
                                    📋 STRATEGY: {strategyConfig.displayName || selectedCategory}
                                </h3>

                                {/* Entry & Exit */}
                                <div className="grid grid-cols-3 gap-4 mb-4">
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-green-400">+{strategyConfig.targetPercent}%</div>
                                        <div className="text-xs text-slate-400">Target</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-red-400">{strategyConfig.stopPercent}%</div>
                                        <div className="text-xs text-slate-400">Stop Loss</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-yellow-400">{strategyConfig.maxHoldDays}</div>
                                        <div className="text-xs text-slate-400">Max Days</div>
                                    </div>
                                </div>

                                {/* Trading Days */}
                                <div className="mb-4">
                                    <div className="text-xs text-slate-400 mb-2">Valid Trading Days:</div>
                                    <div className="flex gap-2">
                                        {strategyConfig.tradingDays?.map(d => (
                                            <span key={d.day} className={\`px-2 py-1 rounded text-xs \${d.weight > 1 ? 'bg-green-500/30 text-green-400' : 'bg-slate-600 text-slate-300'}\`}>
                                                {d.day} {d.weight > 1 && '⭐'}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Price Tiers */}
                                <div className="mb-4">
                                    <div className="text-xs text-slate-400 mb-2">Price Tiers:</div>
                                    <div className="space-y-1">
                                        {strategyConfig.priceTiers?.map((tier, i) => (
                                            <div key={i} className="flex justify-between text-xs">
                                                <span className="text-cyan-400">{tier.name}</span>
                                                <span className="text-slate-400">₹{tier.minPrice}-{tier.maxPrice}</span>
                                                <span className="text-orange-400">{tier.candlePattern}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Avoid Months */}
                                {strategyConfig.avoidMonths?.length > 0 && (
                                    <div className="text-xs">
                                        <span className="text-red-400">⚠️ Avoid:</span>
                                        <span className="text-slate-300 ml-2">{strategyConfig.avoidMonths.join(', ')}</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="bg-yellow-900/20 border border-yellow-500/40 rounded-lg p-4 text-yellow-400 text-sm">
                                ⚠️ No strategy configured for this category. Backtest will use default rules.
                            </div>
                        )}
`;

// 4. New Block (How Signals Are Generated)
const newBlock = `
                        {/* Dynamic Strategy Rules (How Signals Are Generated) */}
                        <div className={\`bg-\${activeRules.color}-900/20 border border-\${activeRules.color}-500/40 rounded-lg p-4 mt-6\`}>
                            <h3 className={\`text-sm font-semibold text-\${activeRules.color}-400 mb-3\`}>
                                {activeRules.title}
                            </h3>
                            <div className="text-xs text-slate-300 space-y-2">
                                {activeRules.rules.map((rule, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <span className="text-lg">{rule.icon}</span>
                                        <span>{rule.text}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
`;

// 5. Construct Final
// Head (0 to headEndIdx) + Middle + NewBlock + Tail (tailStartIdx to end)
const head = lines.slice(0, headEndIdx + 1);
const tail = lines.slice(tailStartIdx);

const finalLines = [...head, middleContent, newBlock, ...tail];

fs.writeFileSync(path, finalLines.join('\n'), 'utf8');
console.log('Successfully restored file');
