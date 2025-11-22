# Cleanup script for old backups
$backupRoot = ".agent/backups"
$maxBackups = 5

# Get all backup folders sorted by creation time (newest first)
$folders = Get-ChildItem $backupRoot -Directory | Sort-Object CreationTime -Descending

# Skip the newest N folders, delete the rest
$foldersToDelete = $folders | Select-Object -Skip $maxBackups

foreach ($folder in $foldersToDelete) {
    Write-Host "Deleting old backup: $($folder.Name)"
    Remove-Item -Recurse -Force $folder.FullName
}
