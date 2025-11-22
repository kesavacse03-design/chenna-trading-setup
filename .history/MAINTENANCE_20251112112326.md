Repository maintenance and restructuring notes

## Goal

Reduce workspace file-count and surface-area so developer tools (editors, watchers, linters) and CI are faster while preserving runtime behavior.

## High-level approach

- Move large historical artifacts (backups, logs, dumps) into an `archive/` folder and exclude them from git and watchers.
- Consolidate runtime state under `.data/` and exclude it from git (already excluded).
- Keep code layout unchanged for runtime modules; only move non-code assets.
- Provide idempotent scripts for reporting and pruning so changes can be reviewed before applying.

## Suggested next steps

1. Run `node scripts/report-large-files.cjs` to see current large files and their sizes.
2. Review and approve files to move into `archive/`.
3. Run `powershell -File scripts/prune-backups.ps1 -WhatIf` to get a dry-run of moves.
4. Commit changes in small, reviewed commits.

## Rollback

All moves use `git mv` or simple moves recorded in a generated `moves.json` so the steps can be reversed.

## Notes

Consider offloading very large datasets (MySQL files, historical job outputs) to an object store (S3/MinIO) and replace with small index files in the repo.
