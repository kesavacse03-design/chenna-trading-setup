# Duplicate File Cleanup Report

This report documents the removal of duplicate frontend source files from the project root. The goal is to consolidate all application code within the `src/` directory and ensure a clean, single source of truth.

All removed files have been moved to `_trash_YYYY-MM-DD/` for safety. No files within `src/`, `backend/`, or `public/` were modified, except to update import paths to use the `@/` alias for consistency.

## Files Moved to Trash

| File / Folder Path      | Canonical Counterpart in `src/` | Reason for Removal                                             |
| ----------------------- | ------------------------------- | -------------------------------------------------------------- |
| `App.tsx`               | `src/App.tsx`                   | Empty file at root shadowing the main application component.   |
| `api.ts`                | `src/api.ts`                    | Duplicate API module.                                          |
| `components/` (folder)  | `src/components/`               | Entire component library duplicated at the project root.       |
| `config.js`             | N/A                             | Empty, unused configuration file.                              |
| `constants.ts`          | `src/constants.ts`              | Duplicate constants module.                                    |
| `index.tsx`             | `src/main.tsx`                  | Obsolete entry point shadowing the correct one (`main.tsx`).   |
| `types.ts`              | `src/types.ts`                  | Duplicate type definitions module.                             |
| `utils/` (folder)       | N/A                             | Orphaned utility folder; its contents were unused.             |

## Unchanged Files (Non-Duplicates)

The following root-level files were inspected and left in place as they are part of a Chrome Extension and do not duplicate `src/` application code:
* `background.js`
* `content-script.js`
* `manifest.json`

## Verification

*   **Build Status:** PASS
*   **Warnings:** None.
*   **Skipped Folders (by design):** `backend/`, `public/`, `src/`. All files within these directories were intentionally preserved.
