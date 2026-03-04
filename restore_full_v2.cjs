const fs = require('fs');
const path = 'd:\\chenna-trading-system-dashboard\\src\\components\\TimeTravelBacktestModal.tsx';

// 1. Read Current File (which has Head 0-179 and Tail 650+)
const currentContent = fs.readFileSync(path, 'utf8');
const lines = currentContent.split('\n');

// 2. Head is lines 0-179 (Up to closing brace of handleOptimalRange)
// Line 179 in current file is "    };"
// Let's verify line 177 is "            setLoading(false);"
let headEndIdx = 179;
if (!lines[177].includes('setLoading(false)')) {
    // Fallback search
    for (let i = 0; i < 300; i++) {
        if (lines[i].includes('setLoading(false)') && lines[i + 2].trim() === '};') {
            headEndIdx = i + 2;
            break;
        }
    }
}
const head = lines.slice(0, headEndIdx + 1);

// 3. Tail starts at "{/* Date Range */}" in current file
let tailStartIdx = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('{/* Date Range */}')) {
        tailStartIdx = i;
        break;
    }
}
const tail = lines.slice(tailStartIdx);


// 4. Construct Missing Block (180-681)
const missingBlock = `
    // State for Data Availability
    // const [useAllData, setUseAllData] = useState(false); // REMOVED in favor of dataMode
    const [dataAvailability, setDataAvailability] = useState<{
        stocksTotal: number;
        stocksWithData: number;
        dateRange: { start: string | null; end: string | null };
        tradingDays: number;
        dataQuality: string;
    } | null>(null);

    // Fetch categories on open
    useEffect(() => {
        if (isOpen) {
            fetchCategories();
        }
    }, [isOpen]);

    // Fetch strategy config when category selected
    useEffect(() => {
        if (selectedCategory) {
            fetchStrategyConfig(selectedCategory);
        }
    }, [selectedCategory]);

    const fetchCategories = async () => {
        try {
            // Fetch all categories
            const res = await fetch(\`\${API_BASE}/categories\`);
            const data = await res.json();

            if (data.success && data.data) {
                // Fetch stock count for each category
                const categoriesWithCounts = await Promise.all(
                    data.data.map(async (cat: { key: string; name: string }) => {
                        try {
                            const stocksRes = await fetch(\`\${API_BASE}/categories/\${cat.key}/stocks\`);
                            const stocksData = await stocksRes.json();
                            return {
                                key: cat.key,
                                name: cat.name,
                                stockCount: stocksData.stocks?.length || 0
                            };
                        } catch {
                            return { key: cat.key, name: cat.name, stockCount: 0 };
                        }
                    })
                );

                // Filter to only categories with stocks
                setCategories(categoriesWithCounts.filter((c: Category) => c.stockCount > 0));
            } else if (data.categories) {
                // Fallback for old structure if any
                setCategories(data.categories);
            }
        } catch (e) {
            console.error('Failed to fetch categories:', e);
        }
    };

    const fetchStrategyConfig = async (categoryKey: string) => {
        setLoading(true);
        try {
            const res = await fetch(\`\${API_BASE}/trading/category-config/\${categoryKey}\`);
            const data = await res.json();
            if (data.success && data.config) {
                setStrategyConfig(data.config);
            } else {
                setStrategyConfig(null);
            }
            // Also fetch data availability
            await fetchDataAvailability(categoryKey);
        } catch (e) {
            console.error('Failed to fetch strategy config:', e);
            setStrategyConfig(null);
        }
        setLoading(false);
    };

    const fetchDataAvailability = async (categoryKey: string) => {
        try {
            const res = await fetch(\`\${API_BASE}/backtest/data-availability/\${categoryKey}\`);
            const data = await res.json();
            if (data.success) {
                setDataAvailability(data.data);
            }
        } catch (e) {
            console.error('Failed to fetch data availability', e);
        }
    };

    const handleCategorySelect = (key: string) => {
        setSelectedCategory(key);
        setPhase('config');
        setConfig(prev => ({ ...prev, dataMode: CATEGORY_TYPES[key]?.dataMode || '1day' }));
    };

    const handleBacktest = async () => {
        if (!selectedCategory) return;
        
        try {
            setLoading(true);
            setError(null);

            if (!strategyConfig) {
                 // Try to fetch it one last time or proceed with defaults?
                 // For now, allow proceeding if config is null (defaults used)
                 // But validation might be needed.
                 console.log('No strategy config loaded, using defaults/hardcoded rules');
            }

            // Validation
            if (!config.startDate || !config.endDate) {
                setError('Please select a valid date range.');
                setLoading(false);
                return;
            }

            const start = new Date(config.startDate);
            const end = new Date(config.endDate);
            if (start > end) {
                setError('Start date must be before end date.');
                setLoading(false);
                return;
            }

            // Check max duration for 1-minute data
            const dayDiff = (end.getTime() - start.getTime()) / (1000 * 3600 * 24);
            if (config.dataMode === '1minute' && dayDiff > 35) {
                 if (!window.confirm('Warning: 1-minute backtests over 30 days may be slow or hit data limits. Continue?')) {
                     setLoading(false);
                     return;
                 }
            }

            const res = await fetch(\`\${API_BASE}/backtest/start\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categoryKey: selectedCategory,
                    strategyVersion: 'V1.0',
                    startDate: config.startDate,
                    endDate: config.endDate,
                    startingCapital: config.startingCapital,
                    positionSizing: { type: 'fixed', amount: config.positionSize },
                    executionMode: config.executionMode,
                    dataMode: config.dataMode,
                    applyQualityFilter: config.applyQualityFilter
                })
            });

            const data = await res.json();

            if (data.success) {
                setBacktestId(data.backtestId);
                setPhase('running');
                // Poll for progress
                pollProgress(data.backtestId);
            } else {
                setError(data.error || 'Failed to start backtest');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    const pollProgress = (id: string) => {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(\`\${API_BASE}/backtest/status/\${id}\`);
                const data = await res.json();

                if (data.success) {
                    setProgress(data.progress);
                    if (data.progress.runningMessage) {
                        setRunningMessage(data.progress.runningMessage);
                    }

                    if (data.progress.status === 'complete') {
                        clearInterval(interval);
                        setResults(data.progress.results || data.results); // specific to backend structure
                        setPhase('results');
                        // Also fetch final results if needed
                        fetchResults(id);
                    } else if (data.progress.status === 'failed') {
                        clearInterval(interval);
                        setError(data.progress.errorMessage || 'Backtest failed');
                        setPhase('config');
                    }
                }
            } catch (e) {
                console.error('Polling error', e);
            }
        }, 1000);
    };

    const fetchResults = async (id: string) => {
        try {
            const res = await fetch(\`\${API_BASE}/backtest/results/\${id}\`);
            const data = await res.json();
            if (data.success) {
                setResults(data.data);
            }
        } catch (e) {
             console.error('Results fetch error', e);
        }
    };
`;

// 5. Middle Content (Same as before)
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

// 6. New Block (How Signals Are Generated)
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
const finalLines = [...head, missingBlock, middleContent, newBlock, ...tail];

fs.writeFileSync(path, finalLines.join('\n'), 'utf8');
console.log('Successfully restored file V2');
