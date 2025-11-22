# Quick Backup Script
# Creates a safety backup commit before making changes

Write-Host "=== Creating Safety Backup ===" -ForegroundColor Cyan

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$message = "🔒 Backup before changes - $timestamp"

Write-Host "📦 Staging files..." -ForegroundColor Yellow
git add . 2>&1 | Out-Null

Write-Host "💾 Creating backup commit..." -ForegroundColor Yellow
git commit -m "$message" 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Backup created successfully!" -ForegroundColor Green
    Write-Host "Commit: $message" -ForegroundColor Gray
} else {
    Write-Host "⚠️ No changes to backup (already committed)" -ForegroundColor Yellow
}

Write-Host "`n=== Recent Backups ===" -ForegroundColor Cyan
git log --grep="Backup" --oneline -5
