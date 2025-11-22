Purpose

This document explains how to schedule the PAPER daily rollout script on Windows using the provided helper scripts.

Files

- `scripts/paper_daily_task.ps1` — wrapper that sets environment and runs `npm run paper:daily` and `npm run paper:monitor`.
- `scripts/register_paper_daily_task.ps1` — helper that registers a Windows Scheduled Task to run `paper_daily_task.ps1` daily.

Quick register (recommended steps)

1. Inspect `scripts/paper_daily_task.ps1` to confirm it uses the correct environment and paths.
2. Open an elevated PowerShell prompt (Run as Administrator).
3. From the `scripts` folder, run:

```powershell
# adjust time if needed (HH:mm)
.\register_paper_daily_task.ps1 -StartTime "03:00" -TaskName "ChennaPaperDailyRun"
```

4. Verify the scheduled task in Task Scheduler -> Task Scheduler Library -> `ChennaPaperDailyRun`.

Notes

- The registration script sets the task to run as `NT AUTHORITY\SYSTEM` with highest privileges. Change the principal in `register_paper_daily_task.ps1` if you prefer a different account.
- The script registers the task but does not execute it immediately. To force a run, use the Task Scheduler UI or:

```powershell
Start-ScheduledTask -TaskName "ChennaPaperDailyRun"
```

- If you want me to register the task for you from this environment I can do that, but I will only do so after you explicitly approve (I won't modify your host's scheduled tasks without permission).
