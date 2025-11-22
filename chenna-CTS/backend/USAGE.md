# OHLCV API Usage and Tips

This backend exposes a historical candles endpoint with caching and multiple fallbacks to work around Upstox quirks.

## Endpoint

GET /api/upstox/ohlcv

Query params:

- symbol: Trading symbol, e.g., RELIANCE (preferred)
- instrument_key: Canonical key, e.g., NSE_EQ|INE002A01018 (ISIN style). If you pass a non-ISIN form like NSE_EQ|RELIANCE, the server will attempt to resolve it.
- from: YYYY-MM-DD
- to: YYYY-MM-DD
- interval: 1m, 5m, 15m, 1h, day, etc. Common forms like 5m/15m/day are normalized.
- debug or diag: 1/true to include diagnostic metadata

## Recommended patterns

- Prefer symbol=... calls. The server resolves to the canonical instrument token and hits Upstox v3 minutes/hours/days endpoints.
- If you must use instrument_key, prefer ISIN keys: NSE_EQ|INE... (or the BSE equivalent) to avoid Upstox "Invalid Instrument key" responses.

## Behavior

- Caching
  - Server: saves files under backend/cache/ohlcv using key+date range.
  - Client (UI): prefetch writes localStorage entries ohlcv:SYMBOL:DATE and shows progress ("fetch X/Y cached").
- Robustness
  - Interval normalized (e.g., 5m -> minutes/5 on v3).
  - from/to order validated and swapped if reversed.
  - Retries on 429/5xx with small backoff.
  - When instrument_key=EXCHANGE|SYMBOL is passed, server attempts:
    1. LTP lookup for instrument_token
    2. Local .data map resolution (NSE/BSE) to a canonical key
- Diagnostics
  - When debug=1, response includes tried URLs, successfulUrl, and resolved instrumentKeys.
  - If Upstox returns 200 with empty candles, server responds ok:false with a clear message.

## Examples

- GET /api/upstox/ohlcv?symbol=RELIANCE&from=2025-10-30&to=2025-10-30&interval=5m&diag=1
- GET /api/upstox/ohlcv?instrument_key=NSE_EQ|INE002A01018&from=2025-10-30&to=2025-10-30&interval=5m&diag=1
