# Backup script for Windows (PowerShell)
$timestamp = Get-Date -Format "yyyy-MM-ddTHH-mm-ss"
$backupDir = ".agent/backups/$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

# Create ZIP archive of repo (excluding .git and node_modules manually)
$exclude = @('.git', 'node_modules')
$itemsToZip = Get-ChildItem -Recurse -File | Where-Object {
    $exclude -notcontains $_.DirectoryName.Split('\')[-1]
}
$itemsToZip | Compress-Archive -DestinationPath "$backupDir/repo-$timestamp.zip" -Force

# Save list of tracked files
git ls-files > "$backupDir/git-files-$timestamp.txt"

# Save metadata
$metadata = @{
    timestamp = $timestamp
    createdBy = $env:USERNAME
    repoPath = (Get-Location).Path
}
$metadata | ConvertTo-Json | Out-File "$backupDir/backup-metadata.json"
