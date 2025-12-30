// src/components/SmartPasteImport.tsx
// Smart Paste Import - Hardened Category Mapping
// - Explicit tredcode → system category mapping
// - Pre-import duplicate detection with symbol+date
// - Validation warnings for unmapped categories

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as api from '../api';
import './SmartPasteImport.css';

// ============================================
// CRITICAL: Explicit tredcode → system mapping
// Each tredcode category header MUST map to exactly one system category
// ============================================
const TREDCODE_TO_SYSTEM: Record<string, string> = {
    // INTRADAY categories (PRO_SETUP)
    'DOWNSIDE LOM INTRA': 'DOWNSIDE_LOM_INTRA',
    'DOWNSIDE LOM INTRA NIFTY': 'DOWNSIDE_LOM_INTRA',
    'DOWNSIDE LOM INTRA ACTIVE': 'DOWNSIDE_LOM_INTRA',

    'UPSIDE LOM INTRA': 'UPSIDE_LOM_INTRA',
    'UPSIDE LOM INTRA NIFTY': 'UPSIDE_LOM_INTRA',
    'UPSIDE LOM INTRA ACTIVE': 'UPSIDE_LOM_INTRA',

    'DAILY CONTRACTION': 'DAILY_CONTRACTION',
    'DAILY CONTRACTION NIFTY': 'DAILY_CONTRACTION',
    'DAILY CONTRACTION ACTIVE': 'DAILY_CONTRACTION',

    'PRE MARKET': 'PRE_MARKET',
    'PRE MARKET NIFTY': 'PRE_MARKET',
    'PRE MARKET ACTIVE': 'PRE_MARKET',
    'PRE-MARKET': 'PRE_MARKET',
    'PRE-MARKET NIFTY': 'PRE_MARKET',

    // SWING categories (SWING_CENTER)
    'DOWNSIDE LOM SWING': 'DOWNSIDE_LOM_SWING',
    'DOWNSIDE LOM SWING NIFTY': 'DOWNSIDE_LOM_SWING',
    'DOWNSIDE LOM SWING ACTIVE': 'DOWNSIDE_LOM_SWING',

    'UPSIDE LOM SWING': 'UPSIDE_LOM_SWING',
    'UPSIDE LOM SWING NIFTY': 'UPSIDE_LOM_SWING',
    'UPSIDE LOM SWING ACTIVE': 'UPSIDE_LOM_SWING',

    'MULTI RESISTANCE BO': 'MULTI_RESISTANCE_BO',
    'MULTI RESISTANCE BO NIFTY': 'MULTI_RESISTANCE_BO',
    'MULTI RESISTANCE BO ACTIVE': 'MULTI_RESISTANCE_BO',

    'MULTI SUPPORT BO': 'MULTI_SUPPORT_BO',
    'MULTI SUPPORT BO NIFTY': 'MULTI_SUPPORT_BO',
    'MULTI SUPPORT BO ACTIVE': 'MULTI_SUPPORT_BO',

    'SHORT TERM SWING BO - UP': 'SHORT_TERM_SWING_BO_UP',
    'SHORT TERM SWING BO UP': 'SHORT_TERM_SWING_BO_UP',
    'SHORT TERM SWING BO - UP NIFTY': 'SHORT_TERM_SWING_BO_UP',
    'SHORT TERM SWING BO - UP ACTIVE': 'SHORT_TERM_SWING_BO_UP',

    'SHORT TERM SWING BO - DOWN': 'SHORT_TERM_SWING_BO_DOWN',
    'SHORT TERM SWING BO DOWN': 'SHORT_TERM_SWING_BO_DOWN',
    'SHORT TERM SWING BO - DOWN NIFTY': 'SHORT_TERM_SWING_BO_DOWN',
    'SHORT TERM SWING BO - DOWN ACTIVE': 'SHORT_TERM_SWING_BO_DOWN',

    'LONG TERM SWING BO - UP': 'LONG_TERM_SWING_BO_UP',
    'LONG TERM SWING BO UP': 'LONG_TERM_SWING_BO_UP',
    'LONG TERM SWING BO - UP NIFTY': 'LONG_TERM_SWING_BO_UP',
    'LONG TERM SWING BO - UP ACTIVE': 'LONG_TERM_SWING_BO_UP',

    'LONG TERM SWING BO - DOWN': 'LONG_TERM_SWING_BO_DOWN',
    'LONG TERM SWING BO DOWN': 'LONG_TERM_SWING_BO_DOWN',
    'LONG TERM SWING BO - DOWN NIFTY': 'LONG_TERM_SWING_BO_DOWN',
    'LONG TERM SWING BO - DOWN ACTIVE': 'LONG_TERM_SWING_BO_DOWN',

    // MARKET DEPTH categories
    'HIGH POWERED STOCKS': 'HIGH_POWERED_STOCKS',
    'HIGH POWERED STOCKS NIFTY': 'HIGH_POWERED_STOCKS',
    'HIGH POWERED STOCKS ACTIVE': 'HIGH_POWERED_STOCKS',

    'INTRADAY BOOST': 'INTRADAY_BOOST',
    'INTRADAY BOOST NIFTY': 'INTRADAY_BOOST',
    'INTRADAY BOOST ACTIVE': 'INTRADAY_BOOST',
};

// Categories to SKIP (detected but not imported)
const SKIP_CATEGORIES = new Set([
    'NEAR PREV. DAY\'S HIGH',
    'NEAR PREV. DAY\'S LOW',
    'NEAR_PREV_DAYS_HIGH',
    'NEAR_PREV_DAYS_LOW',
    'TOP LEVEL STOCKS',
    'LOW LEVEL STOCKS',
    'TOP GAINERS',
    'TOP LOSERS',
    'NIFTY'
]);

// Valid system categories (for validation)
const VALID_SYSTEM_CATEGORIES = new Set([
    'DOWNSIDE_LOM_INTRA', 'UPSIDE_LOM_INTRA', 'DAILY_CONTRACTION', 'PRE_MARKET',
    'DOWNSIDE_LOM_SWING', 'UPSIDE_LOM_SWING', 'MULTI_RESISTANCE_BO', 'MULTI_SUPPORT_BO',
    'SHORT_TERM_SWING_BO_UP', 'SHORT_TERM_SWING_BO_DOWN', 'LONG_TERM_SWING_BO_UP', 'LONG_TERM_SWING_BO_DOWN',
    'HIGH_POWERED_STOCKS', 'INTRADAY_BOOST'
]);

interface ParsedStock {
    symbol: string;
    pctChange: string;
    price: string;
    date: string;
    selected: boolean;
    isDuplicate: boolean;
}

interface CategoryBlock {
    displayName: string;      // Original tredcode category name
    categoryKey: string;      // Mapped system category key
    stocks: ParsedStock[];
    isValid: boolean;         // Whether mapping is valid
    isSkipped: boolean;       // Whether category should be skipped
}

// Clean up tredcode category header
function cleanCategoryName(raw: string): string {
    return raw.replace(/\s+ACTIVE\s*$/i, '').replace(/\s+NIFTY\s*$/i, '').trim().toUpperCase();
}

// Map tredcode category to system category
function mapToSystemCategory(tredcodeName: string): { key: string; isValid: boolean; isSkipped: boolean } {
    const cleaned = cleanCategoryName(tredcodeName);

    // Check if should skip
    if (SKIP_CATEGORIES.has(cleaned) || cleaned.includes('NEAR PREV')) {
        return { key: '', isValid: false, isSkipped: true };
    }

    // Try exact match first
    if (TREDCODE_TO_SYSTEM[cleaned]) {
        return { key: TREDCODE_TO_SYSTEM[cleaned], isValid: true, isSkipped: false };
    }

    // Try with ACTIVE suffix removed
    const withoutActive = cleaned.replace(/\s+ACTIVE\s*$/i, '').trim();
    if (TREDCODE_TO_SYSTEM[withoutActive]) {
        return { key: TREDCODE_TO_SYSTEM[withoutActive], isValid: true, isSkipped: false };
    }

    // Fallback: normalize and check if valid system category
    const normalized = cleaned.replace(/[\s\-–\.\']+/g, '_').replace(/_+/g, '_');
    if (VALID_SYSTEM_CATEGORIES.has(normalized)) {
        return { key: normalized, isValid: true, isSkipped: false };
    }

    // Unknown category - mark as invalid
    console.warn(`[SmartPaste] Unknown tredcode category: "${tredcodeName}" → "${cleaned}"`);
    return { key: normalized, isValid: false, isSkipped: false };
}

// Detect if a line is a category header
function isCategoryHeader(line: string): boolean {
    const u = line.trim().toUpperCase();
    const patterns = [
        'DOWNSIDE LOM', 'UPSIDE LOM', 'MULTI RESISTANCE', 'MULTI SUPPORT',
        'NEAR PREV', 'DAILY CONTRACTION', 'PRE MARKET', 'PRE-MARKET',
        'SHORT TERM SWING', 'LONG TERM SWING', 'HIGH POWERED', 'INTRADAY BOOST',
        'TOP LEVEL', 'LOW LEVEL', 'TOP GAINERS', 'TOP LOSERS'
    ];
    return patterns.some(p => u.includes(p));
}

// Parse stock line
function parseStockLine(line: string): Omit<ParsedStock, 'isDuplicate'> | null {
    const parts = line.split('\t').map(s => s.trim()).filter(Boolean);
    if (parts.length < 3) return null;

    const symbol = parts[0].toUpperCase();
    if (['SYMBOL', 'SEARCH', 'NIFTY', 'BANKNIFTY', 'M&M'].includes(symbol)) return null;
    if (symbol.length < 2 || symbol.length > 15) return null;
    if (/[^A-Z0-9\-]/.test(symbol)) return null;

    let date = new Date().toISOString().slice(0, 10);
    for (const p of parts) {
        const dateMatch = p.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) date = dateMatch[1];
    }

    return { symbol, pctChange: parts[1] || '0', price: parts[2] || '0', date, selected: true };
}

// Parse all data
function parseRawData(text: string): CategoryBlock[] {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const result: CategoryBlock[] = [];

    let currentName = '', currentKey = '', currentValid = false, currentSkipped = false;
    let currentStocks: Array<Omit<ParsedStock, 'isDuplicate'>> = [];

    for (const line of lines) {
        if (/^Search\s+Stock$/i.test(line) || /^Symbol\s/i.test(line)) continue;

        if (isCategoryHeader(line)) {
            // Save previous category if has stocks
            if (currentKey && currentStocks.length > 0 && !currentSkipped) {
                result.push({
                    displayName: currentName,
                    categoryKey: currentKey,
                    stocks: currentStocks.map(s => ({ ...s, isDuplicate: false })),
                    isValid: currentValid,
                    isSkipped: false
                });
            }

            // Start new category
            currentName = line.replace(/\s+ACTIVE\s*$/i, '').trim();
            const mapped = mapToSystemCategory(line);
            currentKey = mapped.key;
            currentValid = mapped.isValid;
            currentSkipped = mapped.isSkipped;
            currentStocks = [];
            continue;
        }

        // Parse stock line
        if (currentKey && !currentSkipped) {
            const stock = parseStockLine(line);
            if (stock) currentStocks.push(stock);
        }
    }

    // Add last category
    if (currentKey && currentStocks.length > 0 && !currentSkipped) {
        result.push({
            displayName: currentName,
            categoryKey: currentKey,
            stocks: currentStocks.map(s => ({ ...s, isDuplicate: false })),
            isValid: currentValid,
            isSkipped: false
        });
    }

    return result;
}

// MODAL
function Modal({ onClose }: { onClose: () => void }) {
    const [raw, setRaw] = useState('');
    const [blocks, setBlocks] = useState<CategoryBlock[]>([]);
    const [checking, setChecking] = useState(false);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<{ added: number; skipped: number; ids: string[] } | null>(null);

    const handleParse = async () => {
        const parsed = parseRawData(raw);
        if (parsed.length === 0) return;

        setChecking(true);

        // Check for duplicates using symbol+date
        const blocksWithDuplicates: CategoryBlock[] = [];

        for (const cat of parsed) {
            let existingKeys = new Set<string>();

            try {
                const existing = await api.getCategoryStocks(cat.categoryKey);
                existingKeys = new Set(existing.map((s: any) => {
                    const sym = (s.symbol || s.stockName || '').toUpperCase();
                    const date = s.date || '';
                    return `${sym}|${date}`;
                }));
                console.log(`[SmartPaste] ${cat.categoryKey}: ${existing.length} existing in DB`);
            } catch (e) {
                console.warn(`Could not fetch existing stocks for ${cat.categoryKey}`, e);
            }

            const stocksWithDuplicateInfo = cat.stocks.map(s => {
                const key = `${s.symbol}|${s.date}`;
                const isDuplicate = existingKeys.has(key);
                return { ...s, isDuplicate, selected: !isDuplicate };
            });

            blocksWithDuplicates.push({ ...cat, stocks: stocksWithDuplicateInfo });
        }

        setBlocks(blocksWithDuplicates);
        setChecking(false);
        setResult(null);
    };

    const validBlocks = blocks.filter(b => b.isValid);
    const invalidBlocks = blocks.filter(b => !b.isValid);
    const totalStocks = validBlocks.reduce((sum, b) => sum + b.stocks.length, 0);
    const duplicateCount = validBlocks.reduce((sum, b) => sum + b.stocks.filter(s => s.isDuplicate).length, 0);
    const newCount = totalStocks - duplicateCount;
    const selectedStocks = validBlocks.flatMap(b => b.stocks.filter(s => s.selected));

    const toggleStock = (catKey: string, symbol: string, date: string) => {
        setBlocks(bs => bs.map(b => b.categoryKey !== catKey ? b : {
            ...b, stocks: b.stocks.map(s => (s.symbol === symbol && s.date === date) ? { ...s, selected: !s.selected } : s)
        }));
    };

    const toggleAll = (catKey: string) => {
        setBlocks(bs => bs.map(b => {
            if (b.categoryKey !== catKey) return b;
            const allSelected = b.stocks.every(s => s.selected);
            return { ...b, stocks: b.stocks.map(s => ({ ...s, selected: !allSelected })) };
        }));
    };

    const selectNewOnly = (catKey: string) => {
        setBlocks(bs => bs.map(b => {
            if (b.categoryKey !== catKey) return b;
            return { ...b, stocks: b.stocks.map(s => ({ ...s, selected: !s.isDuplicate })) };
        }));
    };

    const handleImport = async () => {
        setImporting(true);
        let added = 0, skipped = 0;
        const ids: string[] = [];

        for (const block of validBlocks) {
            for (const s of block.stocks.filter(x => x.selected)) {
                try {
                    await api.createStock({ symbol: s.symbol, date: s.date, category: block.categoryKey });
                    added++;
                    ids.push(`${block.categoryKey}:${s.symbol}:${s.date}`);
                    console.log(`[SmartPaste] ✅ Imported ${s.symbol} → ${block.categoryKey} (${s.date})`);
                } catch (e) {
                    skipped++;
                    console.warn(`[SmartPaste] ❌ Failed ${s.symbol} → ${block.categoryKey}:`, e);
                }
            }
        }

        setResult({ added, skipped, ids });
        setImporting(false);
        window.dispatchEvent(new CustomEvent('cts:watchlist:imported', { detail: { count: added } }));
        window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: `✅ Imported ${added} stocks`, kind: 'success' } }));
    };

    const handleUndo = async () => {
        if (!result?.ids.length) return;
        setImporting(true);
        let deleted = 0;
        for (const id of result.ids) {
            const [cat, sym] = id.split(':');
            try { await api.deleteCategoryStock(cat, sym); deleted++; } catch { }
        }
        setImporting(false);
        setResult(null);
        setBlocks([]);
        setRaw('');
        window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: `🗑️ Deleted ${deleted} stocks`, kind: 'info' } }));
    };

    return (
        <div className="sp-overlay" onClick={onClose}>
            <div className="sp-modal" onClick={e => e.stopPropagation()}>
                <div className="sp-header">
                    <h2>📋 Smart Paste Import</h2>
                    <button className="sp-close" onClick={onClose}>✕</button>
                </div>

                <div className="sp-body">
                    {blocks.length === 0 ? (
                        <>
                            <p className="sp-hint">Paste data from Tredcode. <b>Multi-category supported!</b></p>
                            <textarea
                                className="sp-textarea"
                                value={raw}
                                onChange={e => setRaw(e.target.value)}
                                placeholder="Paste tredcode data here..."
                                disabled={checking}
                            />
                            {checking && <div className="sp-checking">⏳ Checking for duplicates...</div>}
                        </>
                    ) : (
                        <div className="sp-preview">
                            <div className="sp-stats">
                                <span><b>{validBlocks.length}</b> categories</span>
                                <span><b>{totalStocks}</b> total</span>
                                <span className="sp-new"><b>{newCount}</b> new</span>
                                <span className="sp-dup"><b>{duplicateCount}</b> duplicates</span>
                                <span><b>{selectedStocks.length}</b> selected</span>
                                {invalidBlocks.length > 0 && (
                                    <span className="sp-warn">⚠️ {invalidBlocks.length} unmapped</span>
                                )}
                            </div>

                            {invalidBlocks.length > 0 && (
                                <div className="sp-warning">
                                    ⚠️ <b>Warning:</b> These categories could not be mapped: {invalidBlocks.map(b => b.displayName).join(', ')}
                                </div>
                            )}

                            <div className="sp-list">
                                {validBlocks.map(block => {
                                    const newInCat = block.stocks.filter(s => !s.isDuplicate).length;
                                    const dupInCat = block.stocks.filter(s => s.isDuplicate).length;

                                    return (
                                        <details key={block.categoryKey} open className="sp-cat">
                                            <summary className="sp-cat-head">
                                                <span className="sp-cat-name">{block.displayName}</span>
                                                <span className="sp-cat-key">→ {block.categoryKey}</span>
                                                <span className="sp-cat-cnt">
                                                    <span className="sp-new">{newInCat} new</span>
                                                    {dupInCat > 0 && <span className="sp-dup">{dupInCat} dup</span>}
                                                </span>
                                                <button className="sp-toggle" onClick={e => { e.preventDefault(); selectNewOnly(block.categoryKey); }}>New Only</button>
                                                <button className="sp-toggle" onClick={e => { e.preventDefault(); toggleAll(block.categoryKey); }}>Toggle</button>
                                            </summary>
                                            <div className="sp-table-wrap">
                                                <table className="sp-table">
                                                    <thead>
                                                        <tr><th>✓</th><th>Symbol</th><th>%</th><th>Price</th><th>Status</th><th>Date</th></tr>
                                                    </thead>
                                                    <tbody>
                                                        {block.stocks.map((s, i) => (
                                                            <tr key={`${s.symbol}-${s.date}-${i}`} className={`${s.selected ? '' : 'sp-dim'} ${s.isDuplicate ? 'sp-dup-row' : ''}`}>
                                                                <td><input type="checkbox" checked={s.selected} onChange={() => toggleStock(block.categoryKey, s.symbol, s.date)} /></td>
                                                                <td className="sp-sym">{s.symbol}</td>
                                                                <td className={parseFloat(s.pctChange) >= 0 ? 'sp-up' : 'sp-dn'}>{s.pctChange}%</td>
                                                                <td>{s.price}</td>
                                                                <td className={s.isDuplicate ? 'sp-dup-badge' : 'sp-new-badge'}>{s.isDuplicate ? '⚠️ EXISTS' : '✨ NEW'}</td>
                                                                <td className="sp-dt">{s.date}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </details>
                                    );
                                })}
                            </div>

                            {result && (
                                <div className="sp-result">
                                    <span>✅ {result.added} imported, {result.skipped} skipped</span>
                                    {result.ids.length > 0 && (
                                        <button className="sp-undo" onClick={handleUndo} disabled={importing}>🗑️ Undo ({result.ids.length})</button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="sp-footer">
                    {blocks.length === 0 ? (
                        <button className="sp-btn-go" onClick={handleParse} disabled={!raw.trim() || checking}>
                            {checking ? '⏳ Checking...' : '🔍 Parse & Verify Categories'}
                        </button>
                    ) : (
                        <>
                            <button className="sp-btn-back" onClick={() => { setBlocks([]); setResult(null); }}>← Back</button>
                            {!result && (
                                <button className="sp-btn-go" onClick={handleImport} disabled={importing || selectedStocks.length === 0}>
                                    {importing ? '⏳...' : `📥 Import ${selectedStocks.length} stocks`}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function SmartPasteImport() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        document.body.style.overflow = open ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [open]);

    if (!open) {
        return <button className="smart-paste-btn" onClick={() => setOpen(true)}>📋 Smart Paste</button>;
    }

    return createPortal(<Modal onClose={() => setOpen(false)} />, document.body);
}
