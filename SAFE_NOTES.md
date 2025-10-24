# Safe Update Notes

This document outlines the changes made as part of the SAFE UPDATE operation to introduce a robust frontend-only "Preview Mode", client-side data management, and strategy persistence.

## 1. Preview Mode & Stable API

- **Automatic Detection**: The frontend now automatically enters "Preview Mode" if the initial API calls to `/api/health` and `/api/watchlist` fail. This allows the app to function for development and demonstration without a running backend.
- **Stable API Base**: A single helper function in `src/api.ts` now determines the backend URL, prioritizing `window.__CTS_API_BASE`, then `VITE_API_BASE`, and finally falling back to `/api`. This prevents crashes and makes the backend endpoint configurable at runtime.
- **Diagnostic Banner**: A non-intrusive banner appears at the top only in development when the backend is unavailable, clearly indicating that the app is running in Preview Mode.

## 2. Local Storage Persistence

- **New Utility**: A new file, `src/utils/storage.ts`, has been created to centralize all interactions with the browser's LocalStorage. This was necessary for a clean implementation of Preview Mode.
- **Watchlist Data**: In Preview Mode, the entire watchlist, including imported stocks, is saved to and retrieved from `LocalStorage` under the key `cts_watchlist_store`.
- **Strategy Data**: The Strategy Workbench now seeds default logic for each category and saves any user edits directly to `LocalStorage` under the key `cts_strategies_store` when in Preview Mode.
- **Data Management**: A "Clear Preview Data" button has been added to the Import modal's footer (only in Preview Mode) to easily reset the local state.

## 3. Frontend Logic Enhancements

- **Client-Side Expiry**: The watchlist now calculates expiry dates for each stock upon import (10 days for SWING, 1 day for INTRADAY).
- **New UI Columns**:
    - `Status`: A pill now shows the "WATCHING" status for active items.
    - `D-Left`: A column displays the number of days left until a watchlist item expires.
- **Auto-Hiding**: Expired items are automatically hidden from the UI to keep the watchlist clean, but they remain in LocalStorage for potential future analysis.

## 4. README Update

- The `README.md` has been updated with a new section explaining how to dynamically set the API base URL using the browser console (`window.__CTS_API_BASE`), detailing the LocalStorage keys used in Preview Mode, and clarifying how to connect to a real backend.

## 5. Other Safe Changes

- **Endpoint Alignment**: All API calls were already compliant with the whitelisted endpoints.
- **UI Polish**: Minor visual adjustments were made to soften glow effects and ensure consistency, without altering the dashboard layout.
- **Disabled Features**: AI-driven features in the Strategy Workbench remain safely disabled as per previous updates.