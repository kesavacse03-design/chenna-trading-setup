# Migrating Feature Flags to Centralized Module

This guide helps you move scattered feature flags (e.g., inline constants, `process.env` reads) into `src/config/featureFlags.ts`.

## Steps

1. Search for flags:
   - Use grep or VS Code search:
     - `process.env`
     - `REACT_APP_`
     - `if (...)` with boolean toggles

2. For each flag:
   - Add a named export in `featureFlags.ts`
   - Use `process.env.FLAG_NAME === 'true'` pattern
   - Set a default if needed

3. Replace usage:
   - Change `process.env.FLAG_NAME` to `isFeatureEnabled('flagName')`

4. Test:
   - Run build and typecheck
   - Validate feature behavior

5. Commit:
   - One PR per flag group for easy review
