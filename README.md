# Chenna Trading AI System Dashboard (Preview Mode)

This repository contains the full-stack application for the Chenna Trading System. The frontend is a modern React/Vite application that runs by default in a fully-featured **Preview Mode**.

## Preview Mode (Default)

The application is configured to run 100% in the browser without needing a backend server. This is ideal for development, UI testing, and demonstration.

-   **Offline First**: No network calls are made. All data is generated, managed, and persisted locally.
-   **State Persistence**: All application state (watchlist, strategies, trades, notifications) is persisted in your browser's `LocalStorage`. The keys are defined in `src/constants.ts`.
-   **Deterministic Simulation**: The app includes a mock engine that deterministically simulates trade signals, tracking, and outcomes, providing a consistent experience across reloads.

To switch to a real backend in the future, you will only need to flip the `MOCK_MODE` flag in `src/constants.ts` to `false` and uncomment the real API connection logic in `src/api.ts`.

## How to run locally (Windows)

These instructions will get you a copy of the project up and running on your local machine.

### Prerequisites

*   [Node.js](https://nodejs.org/) (v18 or later)
*   [npm](https://www.npmjs.com/) (usually included with Node.js)

### Setup & Installation

1.  **Install Dependencies**
    From the project's root directory, install the required `npm` dependencies:
    ```cmd
    npm install
    ```

2.  **Start the Frontend Server**
    Once dependencies are installed, run the development server:
    ```cmd
    npm run dev
    ```

3.  **Access the Dashboard**
    You can now access the dashboard in your web browser at the address provided in the terminal, typically: **`http://localhost:5173`**.


## CTS Quickstart (Preview Mode, Safe)

**Frontend (Preview Mode — no backend required)**
1. Open PowerShell in repo root.
2. Run: `npm install`
3. Run: `npm run dev`

**Backend (Optional health server)**
1. Open PowerShell in `./chenna-CTS/backend`
2. Run: `npm install`
3. Run: `npm start` (serves `/health` and `/version` on port 3001)

**Auto Backup (Optional)**
1. Open PowerShell in repo root.
2. Run (once): `Set-ExecutionPolicy -Scope Process Bypass -Force`
3. Run: `.\.agent\scripts\git-auto-backup.ps1`


