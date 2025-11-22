# Git Workflow Helper
# This script helps you commit changes safely

param(
    [Parameter(Mandatory=$true)]
    [string]$Message
)

Write-Host "=== Git Workflow Helper ===" -ForegroundColor Cyan

# Check if we're in a git repository
if (-not (Test-Path .git)) {
    Write-Host "❌ Not a git repository. Run 'git init' first." -ForegroundColor Red
    exit 1
}

# Show status
Write-Host "`n📝 Current Status:" -ForegroundColor Yellow
git status --short

# Stage all changes
Write-Host "`n📦 Staging all changes..." -ForegroundColor Yellow
git add .

# Create commit
Write-Host "`n💾 Creating commit..." -ForegroundColor Yellow
git commit -m "$Message"

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Successfully committed: $Message" -ForegroundColor Green
    
    # Show recent commits
    Write-Host "`n📋 Recent commits:" -ForegroundColor Yellow
    git log --oneline -5
} else {
    Write-Host "`n❌ Commit failed" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Tip: To undo last commit (keep changes) ===" -ForegroundColor Cyan
Write-Host "git reset --soft HEAD~1" -ForegroundColor Gray
