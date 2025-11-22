# Clean Up Old Files (1+ month old)
# Safely removes temporary and backup files older than 30 days

Write-Host "=== Cleaning Old Files ===" -ForegroundColor Cyan

$cutoffDate = (Get-Date).AddDays(-30)
$deletedCount = 0
$deletedSize = 0

# Directories to clean
$cleanupDirs = @(
    "tmp",
    "temp", 
    "backup",
    "old",
    ".temp",
    "backend/jobs/checkpoints",
    "archive"
)

foreach ($dir in $cleanupDirs) {
    $fullPath = Join-Path $PSScriptRoot $dir
    
    if (Test-Path $fullPath) {
        Write-Host "`nCleaning: $dir" -ForegroundColor Yellow
        
        # Find old files
        $oldFiles = Get-ChildItem -Path $fullPath -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -lt $cutoffDate }
        
        foreach ($file in $oldFiles) {
            $size = $file.Length
            Write-Host "  Deleting: $($file.Name) ($('{0:N2}' -f ($size/1KB)) KB)" -ForegroundColor Gray
            Remove-Item $file.FullName -Force
            $deletedCount++
            $deletedSize += $size
        }
    }
}

# Clean specific file patterns
Write-Host "`nCleaning file patterns..." -ForegroundColor Yellow
$patterns = @("*.bak", "*.backup", "*_backup_*", "*.tmp", "*.log")

foreach ($pattern in $patterns) {
    $oldFiles = Get-ChildItem -Path $PSScriptRoot -Filter $pattern -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt $cutoffDate }
    
    foreach ($file in $oldFiles) {
        $size = $file.Length
        Write-Host "  Deleting: $($file.FullName) ($('{0:N2}' -f ($size/1KB)) KB)" -ForegroundColor Gray
        Remove-Item $file.FullName -Force
        $deletedCount++
        $deletedSize += $size
    }
}

Write-Host "`n=== Cleanup Complete ===" -ForegroundColor Cyan
Write-Host "Deleted: $deletedCount files" -ForegroundColor Green
Write-Host "Freed: $('{0:N2}' -f ($deletedSize/1MB)) MB" -ForegroundColor Green
