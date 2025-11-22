Change Plan to make CTS realtime-ready (v1) — ≤20 items

1. Add backend `package.json` and minimal start script
   - File: `package.json`
   - Purpose: allow `npm run start` to launch backend on port 3001.

2. Add `src/server/index.js` (minimal Node HTTP server)
   - File: `src/server/index.js`
   - Purpose: start HTTP server on port from env `PORT_BACKEND` (default 3001), provide `/health` and `/stream` (SSE) and stub endpoints for Upstox/Telegram.

3. Add `src/server/integrations.js` (stub manager)
   - File: `src/server/integrations.js`
   - Purpose: export functions that call external integrations if tokens present, otherwise return mocked responses.

4. Update `.env` to include PORT_BACKEND and PORT_FRONTEND and token placeholders
   - File: `.env`
   - Purpose: define `PORT_BACKEND=3001`, `PORT_FRONTEND=5173`, `UPSTOX_TOKEN=`, `TELEGRAM_TOKEN=`.

5. Preserve existing `src/config/featureFlags.ts` (no change) — ensure server reads flags
   - File: `src/config/featureFlags.ts`
   - Purpose: use centralized flags for toggles.

6. Add `README.md` section describing how to start backend and expected ports
   - File: `README.md`
   - Purpose: quick run instructions for Windows dev box.

7. Update `.agent/scripts/backup-repo.ps1` to explicitly exclude `.agent/backups`
   - File: `.agent/scripts/backup-repo.ps1`
   - Purpose: avoid backing up previous backups and ensure idempotency.

8. Add `.agent/backups/.gitignore` (or add `.agent/backups` to `.gitignore`)
   - File: `.gitignore` or `.agent/backups/.gitignore`
   - Purpose: prevent accidental commit of backups.

9. Add `.agent/scripts/ensure-backup-dir.ps1` (idempotent directory creation)
   - File: `.agent/scripts/ensure-backup-dir.ps1`
   - Purpose: create `.agent/backups/<timestamp>` safely; used by backup script.

10. Add migration docs for feature flags (already present) and link in README
    - File: `migration/README-migrate-feature-flags.md`
    - Purpose: ensure developers know where flags live.

11. Add minimal test script to verify `/health` and SSE stream
    - File: `scripts/smoke-test.ps1`
    - Purpose: quick smoke test to confirm server up and streaming works.

12. Create `.agent/backups/<timestamp>/` pre-change backups when editing files
    - Files: under `.agent/backups/<timestamp>/` copy of each touched file
    - Purpose: allow rollback.

13. Commit changes incrementally with clear messages
    - Action: commit after each logical chunk (e.g., add package.json + server; update env; tweak backup scripts).

14. Keep Telegram + Upstox behavior configurable via env tokens
    - Files: `src/server/integrations.js`, `.env`
    - Purpose: if token absent, return local stubbed data.

15. Ensure scripts are Windows-friendly (PowerShell) and idempotent
    - Files: `.agent/scripts/*.ps1`, `scripts/smoke-test.ps1`
    - Purpose: keep cross-developer behavior consistent.

16. Add `docs/READY.md` containing final READY checklist and run commands
    - File: `docs/READY.md`
    - Purpose: final runbook.

17. Optionally add `src/frontend-placeholder/` with README explaining frontend expectations (port 5173)
    - File: `src/frontend-placeholder/README.md`
    - Purpose: placeholder until frontend is present.

18. Update `migration/migrate-feature-flags-plan.md` with exact replacement patterns
    - File: `migration/migrate-feature-flags-plan.md`
    - Purpose: ease real migrations.

19. Validate no new third-party libs are required; use Node built-ins only
    - Files: `src/server/*` will use native `http` and `fs`.

20. Run smoke tests and finalize READY checklist
    - Files: `scripts/smoke-test.ps1`, `docs/READY.md`

Notes: All changes are reversible. Backups will be created before edits; commits will be small and descriptive.
