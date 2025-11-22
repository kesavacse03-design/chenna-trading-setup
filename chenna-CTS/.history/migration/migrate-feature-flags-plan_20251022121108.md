# Migration Plan: Centralize Feature Flags

## Goals
- Move all feature flags to `featureFlags.ts`
- Ensure safe, testable toggles
- Avoid inline or scattered logic

## Checklist

- [ ] Identify all flags (search for `process.env`, `REACT_APP_`, etc.)
- [ ] Add each flag to `featureFlags.ts`
- [ ] Replace old usage with `isFeatureEnabled('flagName')`
- [ ] Run build and tests
- [ ] Document changes in PR
