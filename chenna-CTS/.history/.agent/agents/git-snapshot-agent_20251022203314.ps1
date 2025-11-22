$timestamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
git add .agent/*
git commit -m "Snapshot: $timestamp"
git tag "run-$timestamp"
Write-Host ('Git snapshot committed and tagged as run-{0}' -f $timestamp)


