const { Configuration, OpenAIApi } = require('openai');

/**
 * AI Intelligence Service
 * Provides AI-powered analysis using OpenAI GPT-4 for trading strategy intelligence
 * Includes token usage tracking to monitor costs and prevent unnecessary usage
 */
class AIIntelligence {
    constructor() {
        this.apiKey = process.env.OPENAI_API_KEY;
        this.model = process.env.OPENAI_MODEL || 'gpt-4-turbo';
        this.maxTokens = parseInt(process.env.OPENAI_MAX_TOKENS || '1000');
        this.enabled = process.env.ENABLE_AI_ANALYSIS === 'true';

        // Token usage tracking
        this.totalTokensUsed = 0;
        this.totalCost = 0;
        this.requestCount = 0;
        this.tokenPrices = {
            'gpt-4-turbo': { input: 0.01 / 1000, output: 0.03 / 1000 },
            'gpt-4': { input: 0.03 / 1000, output: 0.06 / 1000 },
            'gpt-3.5-turbo': { input: 0.0005 / 1000, output: 0.0015 / 1000 }
        };

        if (!this.enabled) {
            console.warn('\n⚠️  AI Analysis is disabled. Set ENABLE_AI_ANALYSIS=true in .env to enable.');
            return;
        }

        if (!this.apiKey) {
            console.error('\n❌ OpenAI API key not found. Please set OPENAI_API_KEY in .env file.');
            this.enabled = false;
            return;
        }

        const configuration = new Configuration({ apiKey: this.apiKey });
        this.openai = new OpenAIApi(configuration);

        console.log('\n✅ AI Intelligence initialized with model:', this.model);
    }

    /**
     * Analyze why a trade failed using AI - Core shadow learning function
     */
    async analyzeTradeFailure(signal, priceHistory, marketData) {
        if (!this.enabled) return { analyzed: false, error: 'AI analysis disabled' };

        try {
            const prompt = `You are an expert trading strategy analyst. Analyze why this trade failed.

**Trade Details:**
- Symbol: ${signal.symbol}, Entry: ₹${signal.entryPrice}, Exit: ₹${signal.exitPrice || 'Not exited'}
- Status: ${signal.trackingStatus}, Direction: ${signal.direction}
- Entry Conditions: ${JSON.stringify(signal.entryConditions, null, 2)}

**Price History:** ${this.formatPriceHistory(priceHistory)}
**Market Context:** Volume: ${marketData?.volumeProfile || 'N/A'}, Sentiment: ${marketData?.sentiment || 'N/A'}

**Analyze:** Was this a fake breakout? Which condition was weak? What filter would prevent this?

**Return JSON:** {"rootCause": "summary", "suggestedRule": "exact rule", "confidenceThreshold": 75, "reasoning": "explanation"}`;

            const response = await this.openai.createChatCompletion({
                model: this.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: this.maxTokens,
            });

            this.trackTokenUsage(response);
            const content = response.data.choices[0].message.content;
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            const improvement = jsonMatch ? JSON.parse(jsonMatch[0]) : {
                rootCause: content.substring(0, 200),
                suggestedRule: 'Review AI analysis',
                reasoning: content
            };

            return {
                analyzed: true,
                rootCause: improvement.rootCause,
                newRule: improvement.suggestedRule,
                confidence: improvement.confidenceThreshold,
                fullAnalysis: improvement.reasoning
            };
        } catch (error) {
            console.error('❌ AI analysis failed:', error.message);
            return { analyzed: false, error: error.message };
        }
    }

    /**
     * Detect institutional traps using AI pattern recognition
     */
    async detectInstitutionalTraps(candles, volume, orderFlow = null) {
        if (!this.enabled) return { trapDetected: false, recommendation: 'safe_to_enter' };

        try {
            const prompt = `Analyze for institutional manipulation:

**Candles:** ${this.formatCandles(candles.slice(-20))}
**Volume:** ${this.formatVolume(volume.slice(-20))}

Detect: stop hunts, absorption, volume divergence, liquidity grabs

**Return JSON:** {"trapDetected": bool, "trapType": "type", "confidence": 0-1, "explanation": "text", "recommendation": "avoid|wait|safe_to_enter"}`;

            const response = await this.openai.createChatCompletion({
                model: this.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 500,
            });

            this.trackTokenUsage(response);
            const jsonMatch = response.data.choices[0].message.content.match(/\{[\s\S]*\}/);
            return jsonMatch ? JSON.parse(jsonMatch[0]) : {
                trapDetected: false,
                recommendation: 'safe_to_enter',
                explanation: 'Could not parse response'
            };
        } catch (error) {
            console.error('❌ Trap detection failed:', error.message);
            return { trapDetected: false, recommendation: 'safe_to_enter', error: error.message };
        }
    }

    /**
     * Validate a signal before generation using AI
     */
    async validateSignalWithAI(signal, marketContext) {
        if (!this.enabled) return { approved: true, confidence: 50, reasoning: 'AI disabled' };

        try {
            const prompt = `Validate this trade signal:

**Signal:** ${JSON.stringify(signal, null, 2)}
**Context:** Nifty ${marketContext.indexTrend || '?'}, Sector ${marketContext.sectorPerf || '?'}, VIX ${marketContext.vix || '?'}

Is this high-probability or trap? Timing right? Rate confidence 0-100.

**Return JSON:** {"approved": bool, "confidence": 0-100, "reasoning": "text"}`;

            const response = await this.openai.createChatCompletion({
                model: this.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 300,
            });

            this.trackTokenUsage(response);
            const jsonMatch = response.data.choices[0].message.content.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const validation = JSON.parse(jsonMatch[0]);
                const threshold = parseInt(process.env.AI_CONFIDENCE_THRESHOLD || '75');
                validation.approved = validation.approved && (validation.confidence >= threshold);
                return validation;
            }

            return { approved: false, confidence: 0, reasoning: 'Parse failed' };
        } catch (error) {
            console.error('❌ Validation failed:', error.message);
            return { approved: false, confidence: 0, reasoning: `Error: ${error.message}` };
        }
    }

    formatPriceHistory(candles) {
        if (!candles || candles.length === 0) return 'No price history';
        return candles.slice(-15).map((c, i) =>
            `${i + 1}. O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume}`
        ).join('\\n');
    }

    formatCandles(candles) {
        if (!candles || candles.length === 0) return 'No candles';
        return candles.map((c, i) => {
            const body = Math.abs(c.close - c.open);
            const range = c.high - c.low;
            const bodyPercent = range > 0 ? ((body / range) * 100).toFixed(1) : 0;
            const type = c.close > c.open ? 'BULL' : c.close < c.open ? 'BEAR' : 'DOJI';
            return `${i + 1}. ${type} O:${c.open} H:${c.high} L:${c.low} C:${c.close} Body:${bodyPercent}%`;
        }).join('\\n');
    }

    formatVolume(volumes) {
        if (!volumes || volumes.length === 0) return 'No volume';
        const avgVol = volumes.reduce((sum, v) => sum + (v.volume || 0), 0) / volumes.length;
        return volumes.map((v, i) => {
            const ratio = avgVol > 0 ? (v.volume / avgVol).toFixed(2) : '1.00';
            return `${i + 1}. Vol:${v.volume} (${ratio}x avg)`;
        }).join('\\n');
    }

    /**
     * Track token usage from OpenAI response
     */
    trackTokenUsage(response) {
        if (!response || !response.data || !response.data.usage) return;

        const usage = response.data.usage;
        const inputTokens = usage.prompt_tokens || 0;
        const outputTokens = usage.completion_tokens || 0;
        const totalTokens = usage.total_tokens || (inputTokens + outputTokens);

        this.totalTokensUsed += totalTokens;
        this.requestCount++;

        const prices = this.tokenPrices[this.model] || this.tokenPrices['gpt-4-turbo'];
        const cost = (inputTokens * prices.input) + (outputTokens * prices.output);
        this.totalCost += cost;

        console.log(`\n📊 OpenAI Usage - Request #${this.requestCount}:`);
        console.log(`   Tokens: ${totalTokens} (Input: ${inputTokens}, Output: ${outputTokens})`);
        console.log(`   Cost: $${cost.toFixed(4)}`);
        console.log(`   Total Used: ${this.totalTokensUsed} tokens, $${this.totalCost.toFixed(4)}`);

        if (this.totalCost > 5) {
            console.warn(`\n⚠️  Warning: Total AI cost exceeded $5. Current: $${this.totalCost.toFixed(2)}`);
        }
        if (this.totalTokensUsed > 50000) {
            console.warn(`\n⚠️  Warning: High token usage (${this.totalTokensUsed}). Consider optimizing prompts.`);
        }
    }

    /**
     * Get current usage statistics
     */
    getUsageStats() {
        return {
            totalTokensUsed: this.totalTokensUsed,
            totalCost: parseFloat(this.totalCost.toFixed(4)),
            requestCount: this.requestCount,
            avgTokensPerRequest: this.requestCount > 0 ? Math.round(this.totalTokensUsed / this.requestCount) : 0,
            avgCostPerRequest: this.requestCount > 0 ? parseFloat((this.totalCost / this.requestCount).toFixed(4)) : 0,
            model: this.model
        };
    }

    /**
     * Reset usage statistics
     */
    resetUsageStats() {
        this.totalTokensUsed = 0;
        this.totalCost = 0;
        this.requestCount = 0;
        console.log('\n✅ AI usage statistics reset.');
    }
}

module.exports = new AIIntelligence();
