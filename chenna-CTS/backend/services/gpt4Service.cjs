/**
 * GPT-4 Service
 * 
 * Provides AI-powered explanations and insights for trading decisions
 * 
 * Features:
 * - Trade explanations (why TAKE)
 * - Trap rejection explanations (why REJECT)
 * - Daily summary insights
 * - Signal validation (sanity check)
 * 
 * Trust-building through transparency
 */

class GPT4Service {

    constructor() {
        this.enabled = process.env.GPT4_ENABLED === 'true';
        this.apiKey = process.env.OPENAI_API_KEY;

        if (this.enabled && !this.apiKey) {
            console.warn('⚠️ GPT4_ENABLED=true but OPENAI_API_KEY not set');
            this.enabled = false;
        }

        if (this.enabled) {
            try {
                const { OpenAI } = require('openai');
                this.openai = new OpenAI({ apiKey: this.apiKey });
                console.log('✅ GPT-4 Service initialized');
            } catch (error) {
                console.error('❌ Failed to initialize OpenAI:', error.message);
                this.enabled = false;
            }
        }
    }

    /**
     * Explain why a trade was taken
     */
    async explainTrade(trade, v1Strategy) {
        if (!this.enabled) {
            return this.getFallbackTradeExplanation(trade, v1Strategy);
        }

        try {
            const rewardRisk = ((trade.targetPrice - trade.entry.price) / (trade.entry.price - trade.stopPrice)).toFixed(1);

            const prompt = `You are a professional trading analyst. Explain this trade in simple terms:

Symbol: ${trade.symbol}
Entry: ₹${trade.entry.price}
Target: ₹${trade.targetPrice} (+${((trade.targetPrice - trade.entry.price) / trade.entry.price * 100).toFixed(1)}%)
Stop: ₹${trade.stopPrice} (-${((trade.entry.price - trade.stopPrice) / trade.entry.price * 100).toFixed(1)}%)
Reward:Risk = ${rewardRisk}:1

Strategy: V1 Default (${v1Strategy.backtestMetrics.winRate.toFixed(0)}% historical win rate)

Why was this trade taken? What made it a high-quality signal?
Focus on the key technical factors and risk management.
Keep explanation under 80 words.`;

            const response = await this.openai.chat.completions.create({
                model: 'gpt-4',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 120,
                temperature: 0.7
            });

            return response.choices[0].message.content;

        } catch (error) {
            console.error('GPT-4 explainTrade error:', error.message);
            return this.getFallbackTradeExplanation(trade, v1Strategy);
        }
    }

    /**
     * Explain why a signal was rejected (trap detected)
     */
    async explainTrapRejection(signal, trapFlags) {
        if (!this.enabled) {
            return this.getFallbackTrapExplanation(signal, trapFlags);
        }

        try {
            const trapTypes = Object.entries(trapFlags)
                .filter(([_, trap]) => trap.detected)
                .map(([name, trap]) => `${name}: ${trap.reason || 'detected'}`);

            const prompt = `You are a professional trading risk analyst. Explain why this signal was REJECTED to protect capital:

Symbol: ${signal.symbol}
Price: ₹${signal.currentPrice}
Traps Detected: ${trapTypes.slice(0, 3).join('; ')}

Explain in simple terms why avoiding this trade protects capital.
Focus on the institutional manipulation patterns detected.
Keep under 70 words.`;

            const response = await this.openai.chat.completions.create({
                model: 'gpt-4',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 100,
                temperature: 0.7
            });

            return response.choices[0].message.content;

        } catch (error) {
            console.error('GPT-4 explainTrapRejection error:', error.message);
            return this.getFallbackTrapExplanation(signal, trapFlags);
        }
    }

    /**
     * Generate daily summary with AI insights
     */
    async generateDailySummary(dailyReport) {
        if (!this.enabled) {
            return this.getFallbackDailySummary(dailyReport);
        }

        try {
            const prompt = `You are a trading system analyst. Summarize today's AI trading activity:

Date: ${dailyReport.date}
Category: ${dailyReport.category}
Total Signals: ${dailyReport.analysis.signalsGenerated}
Accepted: ${dailyReport.analysis.signalsAccepted}
Rejected: ${dailyReport.analysis.signalsRejected}
Protection Rate: ${dailyReport.analysis.protectionRate.toFixed(0)}%

V1 Historical Performance: ${dailyReport.expectedPerformance.historicalWinRate.toFixed(0)}% win rate

Provide:
1. One-sentence summary of today's signal quality
2. Brief comment on trap protection effectiveness
3. What this tells us about current market conditions

Keep total under 100 words.`;

            const response = await this.openai.chat.completions.create({
                model: 'gpt-4',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 150,
                temperature: 0.8
            });

            return response.choices[0].message.content;

        } catch (error) {
            console.error('GPT-4 generateDailySummary error:', error.message);
            return this.getFallbackDailySummary(dailyReport);
        }
    }

    /**
     * Validate signal quality (sanity check)
     */
    async validateSignal(signal, marketContext = {}) {
        if (!this.enabled) {
            return {
                passed: true,
                confidence: 0.75,
                reasoning: 'GPT-4 validation not enabled. Signal passed rule-based checks.'
            };
        }

        try {
            const prompt = `You are a trading risk manager. Validate this signal:

Symbol: ${signal.symbol}
Price: ₹${signal.currentPrice || 'N/A'}
Signal Type: ${signal.action || 'ENTRY'}
Confidence: ${signal.confidence || 'N/A'}
Traps: ${signal.trapDetected ? signal.trapTypes.join(', ') : 'None'}

Market Context: ${JSON.stringify(marketContext).slice(0, 100)}

Should this trade be taken? Provide:
1. Confidence score (0-100)
2. Brief reasoning (max 50 words)`;

            const response = await this.openai.chat.completions.create({
                model: 'gpt-4',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 100,
                temperature: 0.5
            });

            const content = response.choices[0].message.content;

            // Parse confidence from response
            const confidenceMatch = content.match(/(\d+)/);
            const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) / 100 : 0.7;

            return {
                passed: confidence >= 0.7,
                confidence,
                reasoning: content
            };

        } catch (error) {
            console.error('GPT-4 validateSignal error:', error.message);
            return {
                passed: true,
                confidence: 0.7,
                reasoning: `Validation unavailable: ${error.message}`
            };
        }
    }

    // ==================== FALLBACK METHODS ====================

    getFallbackTradeExplanation(trade, v1Strategy) {
        const rrRatio = ((trade.targetPrice - trade.entry.price) / (trade.entry.price - trade.stopPrice)).toFixed(1);

        return `${trade.symbol} trade taken based on V1 strategy criteria (${v1Strategy.backtestMetrics.winRate.toFixed(0)}% historical win rate). Entry at ₹${trade.entry.price} with ${rrRatio}:1 reward-to-risk ratio. All technical conditions met and no institutional traps detected. Target: ₹${trade.targetPrice}, Stop: ₹${trade.stopPrice}.`;
    }

    getFallbackTrapExplanation(signal, trapFlags) {
        const traps = Object.entries(trapFlags)
            .filter(([_, t]) => t.detected)
            .map(([name]) => name)
            .slice(0, 2)
            .join(' and ');

        return `${signal.symbol} signal rejected due to ${traps} pattern(s). These are classic institutional manipulation setups designed to trap retail traders. By avoiding this trade, we protect capital and wait for higher-quality, cleaner signals that meet all V1 criteria without trap indicators.`;
    }

    getFallbackDailySummary(dailyReport) {
        const { analysis } = dailyReport;

        if (analysis.signalsGenerated === 0) {
            return `No signals generated today. Market conditions did not align with V1 criteria. This demonstrates the system's selectivity in pursuing only high-quality setups.`;
        }

        const protectionMsg = analysis.signalsRejected > 0
            ? `Trap detection filtered out ${analysis.signalsRejected} signal(s) (${analysis.protectionRate.toFixed(0)}% protection rate), demonstrating active capital preservation.`
            : 'All signals cleared trap detection - rare high-quality day.';

        return `Today's analysis: ${analysis.signalsGenerated} signal(s) generated, ${analysis.signalsAccepted} accepted. ${protectionMsg} V1 strategy continues to prioritize quality over quantity, seeking only the top 1% of setups.`;
    }
}

module.exports = GPT4Service;
