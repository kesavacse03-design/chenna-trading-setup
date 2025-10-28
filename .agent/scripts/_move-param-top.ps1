$path = ".\.agent\scripts\git-auto-backup.ps1"

# Read entire file
$raw = Get-Content -Raw -LiteralPath $path -ErrorAction Stop -Encoding UTF8

# Split into lines (preserve empties)
$lineArr = $raw -split "`r?`n"

# Find param( start line
$startIndex = -1
for ($i=0; $i -lt $lineArr.Count; $i++) {
  if ($lineArr[$i].TrimStart().StartsWith("param(")) { $startIndex = $i; break }
}

if ($startIndex -eq -1) {
  Write-Error "No param(...) block found. Aborting auto-fix."
  return
}

# Find matching closing paren for param block
$parenCount = 0
$endIndex = -1
for ($i = $startIndex; $i -lt $lineArr.Count; $i++) {
  $chars = $lineArr[$i].ToCharArray()
  foreach ($ch in $chars) {
    if ($ch -eq '(') { $parenCount++ }
    elseif ($ch -eq ')') { $parenCount-- }
  }
  if ($parenCount -eq 0) { $endIndex = $i; break }
}

if ($endIndex -eq -1) {
  Write-Error "Could not find the end of the param(...) block. Aborting auto-fix."
  return
}

# Extract blocks
$paramBlock = $lineArr[$startIndex..$endIndex]
$before = if ($startIndex -gt 0) { $lineArr[0..($startIndex - 1)] } else { @() }
$after  = if ($endIndex -lt ($lineArr.Count - 1)) { $lineArr[($endIndex + 1)..($lineArr.Count - 1)] } else { @() }

# Compose new file content: param block first, then everything else
$newArr = @()
$newArr += $paramBlock
$newArr += ""          # blank line for separation
$newArr += $before
$newArr += $after

# Write new content (UTF8)
Set-Content -LiteralPath $path -Value ($newArr -join "`r`n") -Encoding UTF8 -Force

Write-Output "param(...) block moved to top of $path. Backup saved earlier."
