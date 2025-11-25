const axios = require('axios');
const AIIntelligence = require('./AIIntelligence.cjs');

/**
 * Market Sentiment Service
 * Aggregates sentiment from various sources (News, FII/DII, VIX, PCR)
 * to provide a holistic market view.
 */
class MarketSentiment {
    constructor() {
        this.cache = {
            sentiment: null,
            lastUpdated: 0,
            fiiDii: null,
            newsSentiment: null
        };
        this.CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
    }

    /**
     * Get overall market sentiment
     * Returns: { score: -1 to 1, label: 'BULLISH'|'BEARISH'|'NEUTRAL', details: {...} }
     */
    async getMarketSentiment() {
        // Return cached if valid
        if (this.cache.sentiment && (Date.now() - this.cache.lastUpdated < this.CACHE_DURATION)) {
            return this.cache.sentiment;
        }

        try {
            // 1. Get FII/DII Data (Institutional Activity)
            const fiiDii = await this.getFIIDIIData();

            // 2. Get Global Market Cues (US/Asian markets)
            const globalCues = await this.getGlobalCues();

            // 3. Get VIX (Volatility Index) Status
            const vixStatus = await this.getVIXStatus();

            // 4. Get PCR (Put Call Ratio) - Mocked for now or fetched if available
            const pcrStatus = await this.getPCRStatus();

            // 5. Calculate Composite Score
            // Weights: FII/DII (30%), Global (20%), VIX (20%), PCR (30%)

            let score = 0;

            // FII/DII Impact
            if (fiiDii.netFlow > 500) score += 0.3;       // Strong Buying
            else if (fiiDii.netFlow > 0) score += 0.1;    // Mild Buying
            else if (fiiDii.netFlow < -500) score -= 0.3; // Strong Selling
            else if (fiiDii.netFlow < 0) score -= 0.1;    // Mild Selling

            // Global Cues Impact
            if (globalCues === 'POSITIVE') score += 0.2;
            else if (globalCues === 'NEGATIVE') score -= 0.2;

            // VIX Impact (Lower VIX usually bullish/stable, High VIX bearish/volatile)
            // Assuming VIX < 15 is bullish/stable, > 20 is bearish/fear
            if (vixStatus.value < 15) score += 0.1;
            else if (vixStatus.value > 20) score -= 0.2;

            // PCR Impact (PCR > 1 Bullish, < 0.7 Bearish usually, but varies)
            // Standard interpretation: > 1 Bullish (Puts > Calls written? No, actually PCR > 1 means more Puts, often support/oversold or bearish depending on OI interpretation. 
            // Let's use standard Nifty interpretation: Rising PCR > 1 is often Bullish (Support building), Dropping PCR < 0.7 is Bearish (Resistance).
            if (pcrStatus.value > 1.2) score += 0.2; // Oversold/Support
            else if (pcrStatus.value < 0.6) score -= 0.2; // Overbought/Resistance
            else if (pcrStatus.value > 0.9) score += 0.1; // Mild Bullish

            // Determine Label
            let label = 'NEUTRAL';
            if (score > 0.3) label = 'BULLISH';
            else if (score > 0.6) label = 'STRONGLY BULLISH';
            else if (score < -0.3) label = 'BEARISH';
            else if (score < -0.6) label = 'STRONGLY BEARISH';

            const sentiment = {
                score: parseFloat(score.toFixed(2)),
                label,
                components: {
                    fiiDii,
                    globalCues,
                    vix: vixStatus,
                    pcr: pcrStatus
                },
                timestamp: new Date().toISOString()
            };

            this.cache.sentiment = sentiment;
            this.cache.lastUpdated = Date.now();

            return sentiment;

        } catch (error) {
            console.error('Error calculating market sentiment:', error.message);
            return { score: 0, label: 'NEUTRAL', error: error.message };
        }
    }

    /**
     * Analyze News Headlines using AI
     * @param {Array} headlines - List of news strings
     */
    async analyzeNewsSentiment(headlines) {
        if (!headlines || headlines.length === 0) return { score: 0, summary: 'No news' };

        // Use AI Intelligence to analyze
        try {
            // Construct prompt for AI
            // This would typically call AIIntelligence.analyzeText or similar
            // For now, we'll do a simple keyword match or mock AI call if AI service has a generic text method
            // Since AIIntelligence is specialized for trade analysis, we might need to add a generic method there or use it directly here if we had access to the instance's openai object (which we don't directly expose).
            // But AIIntelligence.cjs exports an instance. We can add a method there or just do basic analysis here.

            // Let's do basic keyword analysis for speed/cost, or use AI if critical.
            // Given the "AI Strategy Workbench" goal, let's assume we want AI.
            // But we don't have a generic "askAI" method exposed on the imported service yet. 
            // We'll stick to a simple heuristic for now to save tokens, unless requested.

            let score = 0;
            const positiveWords = ['surge', 'jump', 'gain', 'rally', 'bull', 'growth', 'profit', 'record', 'buy'];
            const negativeWords = ['plunge', 'drop', 'fall', 'crash', 'bear', 'loss', 'debt', 'crisis', 'sell', 'warn'];

            headlines.forEach(text => {
                const lower = text.toLowerCase();
                positiveWords.forEach(w => { if (lower.includes(w)) score += 1; });
                negativeWords.forEach(w => { if (lower.includes(w)) score -= 1; });
            });

            const normalizedScore = Math.max(-1, Math.min(1, score / headlines.length)); // Normalize -1 to 1

            return {
                score: normalizedScore,
                label: normalizedScore > 0.2 ? 'POSITIVE' : normalizedScore < -0.2 ? 'NEGATIVE' : 'NEUTRAL',
                headlineCount: headlines.length
            };

        } catch (error) {
            console.error('News analysis failed:', error);
            return { score: 0, label: 'NEUTRAL' };
        }
    }

    // --- Data Fetchers (Mocked for now, replace with real APIs) ---

    async getFIIDIIData() {
        // TODO: Integrate with NSE/Moneycontrol API
        // Mock data: Net positive flow
        return {
            fiiNet: 1200, // Crores
            diiNet: -400,
            netFlow: 800,
            date: new Date().toISOString().split('T')[0]
        };
    }

    async getGlobalCues() {
        // TODO: Fetch US Futures / SGX Nifty
        // Mock: Positive
        return 'POSITIVE';
    }

    async getVIXStatus() {
        // TODO: Fetch India VIX
        // Mock: Stable
        return { value: 13.5, trend: 'stable' };
    }

    async getPCRStatus() {
        // TODO: Fetch Nifty PCR
        // Mock: Bullish
        return { value: 1.1, trend: 'rising' };
    }
}

module.exports = new MarketSentiment();
