/**
 * AI Signal Ranking Service
 *
 * Calls AI to rank IB signals. Supports:
 *   1. OpenAI (gpt-4o-mini) — primary, cheapest (~₹0.01 per batch)
 *   2. Gemini Flash — fallback (free tier)
 *
 * Rate-limited: max 1 call per 30 min, cached per date.
 */

const aiAnalysisService = require('./aiAnalysisService.cjs');
const signalExporter = require('./signalExporter.cjs');

// Rate limiting — short cooldown since signals arrive in waves
let lastCallTime = 0;
const MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes (signals arrive every 2 min)
let lastSignalCount = 0; // Track if new signals arrived
let callCount = 0;

class AIRankingService {
    constructor() {
        this.openaiKey = process.env.OPENAI_API_KEY || null;
        this.geminiKey = process.env.GEMINI_API_KEY || null;
    }

    /**
     * Main entry: analyze signals for a date
     */
    async analyzeSignals(dateStr, force = false) {
        // Re-read keys (in case set after startup)
        this.openaiKey = process.env.OPENAI_API_KEY || this.openaiKey;
        this.geminiKey = process.env.GEMINI_API_KEY || this.geminiKey;

        if (!this.openaiKey && !this.geminiKey) {
            throw new Error('No AI API key set. Add OPENAI_API_KEY or GEMINI_API_KEY to .env');
        }

        // Build prompt first to get signal count (needed for cache invalidation)
        console.log(`[AIRanking] Building enriched prompt for ${dateStr}...`);
        const exportData = await signalExporter.exportSignalsForAnalysis(dateStr);
        if (exportData.signalCount === 0) {
            throw new Error(`No signals found for ${dateStr}`);
        }

        // Check cache — but invalidate if signal count changed (new signals arrived)
        if (!force) {
            const cached = await aiAnalysisService.getAnalysis(dateStr);
            if (cached) {
                const cachedCount = cached._metadata?.signalCount || 0;
                if (cachedCount === exportData.signalCount) {
                    console.log(`[AIRanking] Using cached analysis for ${dateStr} (${cachedCount} signals, unchanged)`);
                    return { source: 'cache', analysis: cached };
                }
                console.log(`[AIRanking] Cache stale: ${cachedCount} → ${exportData.signalCount} signals. Re-analyzing...`);
            }
        }

        // Rate limit (5 min between calls)
        const now = Date.now();
        if (now - lastCallTime < MIN_INTERVAL_MS && lastCallTime > 0) {
            // If signal count changed, allow bypass of rate limit
            if (exportData.signalCount !== lastSignalCount) {
                console.log(`[AIRanking] New signals detected (${lastSignalCount} → ${exportData.signalCount}), bypassing cooldown`);
            } else {
                const waitSec = Math.ceil((MIN_INTERVAL_MS - (now - lastCallTime)) / 1000);
                throw new Error(`Rate limited. Try again in ${waitSec}s. Signal count unchanged (${exportData.signalCount}).`);
            }
        }

        // Call AI (OpenAI first, Gemini fallback)
        lastCallTime = Date.now();
        lastSignalCount = exportData.signalCount;
        callCount++;
        let response, provider;

        if (this.openaiKey) {
            console.log(`[AIRanking] Calling OpenAI gpt-4o-mini (${exportData.signalCount} signals)...`);
            response = await this._callOpenAI(exportData.promptText);
            provider = 'OpenAI gpt-4o-mini';
        } else {
            console.log(`[AIRanking] Calling Gemini Flash (${exportData.signalCount} signals)...`);
            response = await this._callGemini(exportData.promptText);
            provider = 'Gemini Flash 2.0';
        }

        // Parse response
        const analysis = this._parseJSON(response);

        // Save
        await aiAnalysisService.saveAnalysis(dateStr, {
            ...analysis,
            _metadata: {
                source: provider,
                signalCount: exportData.signalCount,
                apiCallNumber: callCount,
                analyzedAt: new Date().toISOString()
            }
        });

        console.log(`[AIRanking] ✅ ${provider} analysis saved for ${dateStr}: ${analysis.topPicks?.length || 0} top, ${analysis.mediumTier?.length || 0} medium, ${analysis.avoid?.length || 0} avoid`);
        return { source: provider, analysis };
    }

    // ─── OpenAI ────────────────────────────────────
    async _callOpenAI(promptText) {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.openaiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are an expert intraday ORB trader. Return ONLY valid JSON, no markdown.' },
                    { role: 'user', content: promptText }
                ],
                temperature: 0.3,
                max_tokens: 2048,
                response_format: { type: 'json_object' }
            })
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`OpenAI error ${res.status}: ${err.substring(0, 300)}`);
        }

        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;

        // Log cost estimate
        const usage = data.usage || {};
        const costUSD = ((usage.prompt_tokens || 0) * 0.15 + (usage.completion_tokens || 0) * 0.6) / 1_000_000;
        console.log(`[AIRanking] OpenAI usage: ${usage.prompt_tokens || '?'}in + ${usage.completion_tokens || '?'}out = ~$${costUSD.toFixed(4)} (~₹${(costUSD * 85).toFixed(2)})`);

        return text;
    }

    // ─── Gemini ────────────────────────────────────
    async _callGemini(promptText) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.geminiKey}`;

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 2048,
                    responseMimeType: 'application/json'
                }
            })
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Gemini error ${res.status}: ${err.substring(0, 300)}`);
        }

        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text;
    }

    // ─── JSON Parser ─────────────────────────────
    _parseJSON(text) {
        if (!text) {
            return { date: 'unknown', marketAnalysis: 'AI returned empty response.', topPicks: [], avoid: [] };
        }

        try {
            let cleaned = text.trim();
            // Strip markdown fences if present
            if (cleaned.startsWith('```')) {
                cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
            }
            const parsed = JSON.parse(cleaned);

            if (!parsed.topPicks || !Array.isArray(parsed.topPicks)) {
                throw new Error('Missing topPicks array');
            }
            return parsed;
        } catch (e) {
            console.error('[AIRanking] JSON parse error:', e.message, 'Raw:', text?.substring(0, 200));
            return {
                date: 'unknown',
                marketAnalysis: 'AI response could not be parsed. Use system scores.',
                topPicks: [],
                avoid: [],
                _parseError: e.message
            };
        }
    }

    getStatus() {
        return {
            provider: this.openaiKey ? 'OpenAI gpt-4o-mini' : (this.geminiKey ? 'Gemini Flash' : 'None'),
            hasKey: !!(this.openaiKey || this.geminiKey),
            callCount,
            lastCallTime: lastCallTime > 0 ? new Date(lastCallTime).toISOString() : null,
            cooldownMin: lastCallTime > 0
                ? Math.max(0, Math.ceil((MIN_INTERVAL_MS - (Date.now() - lastCallTime)) / 60000))
                : 0
        };
    }
}

module.exports = new AIRankingService();
