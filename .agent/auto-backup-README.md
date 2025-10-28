# Auto Backup (git-auto-backup)

This folder contains scripts to run a safe, non-destructive automatic Git backup for the repository.

Files added:

- `.agent/scripts/git-auto-backup.ps1` — main watcher (looping) with `-Test` mode.
- `.agent/scripts/ensure-git-auth.ps1` — interactive helper to configure credentials.
- `.agent/scripts/register-auto-backup-task.ps1` — registers a Windows Scheduled Task.
- `.agent/scripts/prune-backups.ps1` — prune old remote backup branches (dry-run by default).
- `.agent/git-auto-backup.log` — runtime log file (created at first run).
- `.vscode/tasks.json` — VS Code task to run the watcher in Test mode.

Quick setup (one-time):

1. Checkout the new branch:

   git checkout feature/auto-backup-improvements

2. Configure Git auth (run interactively):

   pwsh .\.agent\scripts\ensure-git-auth.ps1

3. Test a single run (it will commit and push one cycle if changes exist):

   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
   powershell -File .\.agent\scripts\git-auto-backup.ps1 -Test

4. Register the Task Scheduler task to run at logon:

   powershell -File .\.agent\scripts\register-auto-backup-task.ps1 -RunAtLogon

Restoring files from a backup branch:

    git fetch origin
    git checkout origin/auto-backup/<PCNAME>/<TIMESTAMP> -- path/to/file

Pruning old backups (dry-run first):

    pwsh .\.agent\scripts\prune-backups.ps1 -KeepLatestPerHost 10
    # then run with -Confirm to delete
    pwsh .\.agent\scripts\prune-backups.ps1 -KeepLatestPerHost 10 -Confirm

Logging:

- The script writes JSON-ish structured log lines to `.agent/git-auto-backup.log`.

Troubleshooting common push failures:

- Auth failures: Run `ensure-git-auth.ps1` and follow the prompts. For HTTPS, ensure `manager-core` (or `manager`) credential helper is configured. For SSH, ensure your key is loaded with `ssh-add` and present in your Git provider.
- Large files: Files >50MB are skipped and logged; add large assets to `.gitignore` if appropriate.
- Protected branches: The auto-backup always pushes to `auto-backup/*` branches; ensure no repo policy blocks creating new branches remotely.
