/**
 * Seed Default Strategies for All Categories
 * Seeds StrategyVersion table with category-specific default strategies
 * Run: node scripts/seed_strategies.cjs
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Category-specific strategies based on trading logic
const CATEGORY_STRATEGIES = {
    // INTRADAY Categories (PRO_SETUP)
    'DOWNSIDE_LOM_INTRA': {
        description: 'Intraday bearish momentum strategy. Targets stocks breaking down from opening low of day with volume confirmation.',
        rules: {
            entry: {
                condition: 'price_below_open_low',
                volumeConfirm: true,
                rsiThreshold: 40,
                macdSignal: 'bearish_cross'
            },
            exit: {
                targetPct: 1.5,
                stopLossPct: 0.75,
                trailingStop: true
            }
        },
        params: { trackingDays: 1, direction: 'SHORT', timeframe: 'intraday' }
    },

    'UPSIDE_LOM_INTRA': {
        description: 'Intraday bullish momentum strategy. Targets stocks breaking above opening high with strong volume.',
        rules: {
            entry: {
                condition: 'price_above_open_high',
                volumeConfirm: true,
                rsiThreshold: 60,
                macdSignal: 'bullish_cross'
            },
            exit: {
                targetPct: 1.5,
                stopLossPct: 0.75,
                trailingStop: true
            }
        },
        params: { trackingDays: 1, direction: 'LONG', timeframe: 'intraday' }
    },

    'DAILY_CONTRACTION': {
        description: 'Volatility contraction breakout. Targets stocks with narrowing daily range ready for expansion.',
        rules: {
            entry: {
                condition: 'range_contraction_breakout',
                atrMultiple: 0.5,
                volumeConfirm: true
            },
            exit: {
                targetPct: 2.0,
                stopLossPct: 1.0,
                trailingStop: true
            }
        },
        params: { trackingDays: 1, direction: 'LONG', timeframe: 'intraday' }
    },

    'PRE_MARKET': {
        description: 'Pre-market gap strategy. Targets stocks with significant pre-market activity for opening moves.',
        rules: {
            entry: {
                condition: 'gap_with_volume',
                gapThresholdPct: 1.0,
                volumeMultiple: 1.5
            },
            exit: {
                targetPct: 1.5,
                stopLossPct: 0.75,
                timeLimit: '11:00'
            }
        },
        params: { trackingDays: 1, direction: 'LONG', timeframe: 'intraday' }
    },

    // SWING Categories
    'DOWNSIDE_LOM_SWING': {
        description: 'Multi-day bearish swing strategy. Targets stocks in downtrend breaking key support levels.',
        rules: {
            entry: {
                condition: 'support_breakdown',
                maBelow: [20, 50],
                rsiThreshold: 45,
                volumeConfirm: true
            },
            exit: {
                targetPct: 5.0,
                stopLossPct: 2.5,
                trailingStopPct: 3.0
            }
        },
        params: { trackingDays: 10, direction: 'SHORT', timeframe: 'swing' }
    },

    'UPSIDE_LOM_SWING': {
        description: 'Multi-day bullish swing strategy. Targets stocks breaking above resistance with trend confirmation.',
        rules: {
            entry: {
                condition: 'resistance_breakout',
                maAbove: [20, 50],
                rsiThreshold: 55,
                volumeConfirm: true
            },
            exit: {
                targetPct: 5.0,
                stopLossPct: 2.5,
                trailingStopPct: 3.0
            }
        },
        params: { trackingDays: 10, direction: 'LONG', timeframe: 'swing' }
    },

    'MULTI_RESISTANCE_BO': {
        description: 'Multi-level resistance breakout. Targets stocks clearing multiple resistance zones.',
        rules: {
            entry: {
                condition: 'multi_resistance_clear',
                resistanceLevels: 2,
                volumeMultiple: 1.5,
                rsiAbove: 50
            },
            exit: {
                targetPct: 6.0,
                stopLossPct: 2.0,
                trailingStopPct: 3.5
            }
        },
        params: { trackingDays: 10, direction: 'LONG', timeframe: 'swing' }
    },

    'MULTI_SUPPORT_BO': {
        description: 'Multi-level support breakdown. Targets stocks breaking multiple support zones for shorts.',
        rules: {
            entry: {
                condition: 'multi_support_break',
                supportLevels: 2,
                volumeMultiple: 1.5,
                rsiBelow: 50
            },
            exit: {
                targetPct: 6.0,
                stopLossPct: 2.0,
                trailingStopPct: 3.5
            }
        },
        params: { trackingDays: 10, direction: 'SHORT', timeframe: 'swing' }
    },

    'SHORT_TERM_SWING_BO_UP': {
        description: 'Short-term bullish breakout (3-5 days). Quick momentum plays on breakout stocks.',
        rules: {
            entry: {
                condition: 'short_term_breakout',
                priceAboveMA: 10,
                volumeSpike: true,
                rsiRange: [45, 70]
            },
            exit: {
                targetPct: 4.0,
                stopLossPct: 1.5,
                trailingStopPct: 2.0
            }
        },
        params: { trackingDays: 5, direction: 'LONG', timeframe: 'short_swing' }
    },

    'SHORT_TERM_SWING_BO_DOWN': {
        description: 'Short-term bearish breakdown (3-5 days). Quick momentum shorts on breakdown stocks.',
        rules: {
            entry: {
                condition: 'short_term_breakdown',
                priceBelowMA: 10,
                volumeSpike: true,
                rsiRange: [30, 55]
            },
            exit: {
                targetPct: 4.0,
                stopLossPct: 1.5,
                trailingStopPct: 2.0
            }
        },
        params: { trackingDays: 5, direction: 'SHORT', timeframe: 'short_swing' }
    },

    'LONG_TERM_SWING_BO_UP': {
        description: 'Long-term bullish position (10+ days). Major trend following for sustained moves.',
        rules: {
            entry: {
                condition: 'long_term_trend_up',
                priceAboveMA: [20, 50, 100],
                volumeConfirm: true,
                rsiAbove: 50
            },
            exit: {
                targetPct: 10.0,
                stopLossPct: 4.0,
                trailingStopPct: 5.0
            }
        },
        params: { trackingDays: 15, direction: 'LONG', timeframe: 'long_swing' }
    },

    'LONG_TERM_SWING_BO_DOWN': {
        description: 'Long-term bearish position (10+ days). Major downtrend following for sustained shorts.',
        rules: {
            entry: {
                condition: 'long_term_trend_down',
                priceBelowMA: [20, 50, 100],
                volumeConfirm: true,
                rsiBelow: 50
            },
            exit: {
                targetPct: 10.0,
                stopLossPct: 4.0,
                trailingStopPct: 5.0
            }
        },
        params: { trackingDays: 15, direction: 'SHORT', timeframe: 'long_swing' }
    },

    // MARKET DEPTH Categories
    'HIGH_POWERED_STOCKS': {
        description: 'High momentum stocks with strong institutional buying. Volume and price confirmation required.',
        rules: {
            entry: {
                condition: 'institutional_momentum',
                volumeMultiple: 2.0,
                priceStrength: true,
                relativeStrength: 'outperform'
            },
            exit: {
                targetPct: 5.0,
                stopLossPct: 2.0,
                trailingStopPct: 3.0
            }
        },
        params: { trackingDays: 10, direction: 'LONG', timeframe: 'swing' }
    },

    'INTRADAY_BOOST': {
        description: 'High volatility intraday movers. Quick trades on stocks showing 2%+ moves.',
        rules: {
            entry: {
                condition: 'intraday_momentum',
                pctMoveMin: 2.0,
                volumeSpike: true,
                timeWindow: '09:30-11:30'
            },
            exit: {
                targetPct: 1.0,
                stopLossPct: 0.5,
                timeLimit: '15:00'
            }
        },
        params: { trackingDays: 1, direction: 'LONG', timeframe: 'intraday' }
    }
};

async function seedStrategies() {
    console.log('\n========================================');
    console.log('    SEEDING DEFAULT STRATEGIES');
    console.log('========================================\n');

    let created = 0;
    let skipped = 0;

    for (const [categoryKey, strategy] of Object.entries(CATEGORY_STRATEGIES)) {
        try {
            // Check if V1 already exists
            const existing = await prisma.strategyVersion.findFirst({
                where: { categoryKey, version: 'V1' }
            });

            if (existing) {
                console.log(`  ⏭️  ${categoryKey}: V1 already exists - skipped`);
                skipped++;
                continue;
            }

            // Create V1 strategy
            await prisma.strategyVersion.create({
                data: {
                    categoryKey,
                    version: 'V1',
                    description: strategy.description,
                    rules: strategy.rules,
                    params: strategy.params,
                    isActive: true,
                    isShadow: false
                }
            });

            console.log(`  ✅ ${categoryKey}: V1 created`);
            created++;

        } catch (e) {
            console.error(`  ❌ ${categoryKey}: Error - ${e.message}`);
        }
    }

    console.log('\n========================================');
    console.log(`    Created: ${created} | Skipped: ${skipped}`);
    console.log('========================================\n');

    await prisma.$disconnect();
}

seedStrategies().catch(e => {
    console.error('Seed failed:', e);
    process.exit(1);
});
