<#
.agent/scripts/ensure-git-auth.ps1

One-time helper to configure Git credentials for non-interactive pushes.

Usage:
    pwsh .\.agent\scripts\ensure-git-auth.ps1

This script will detect remote URL type (HTTPS or SSH) and guide the user.
#>
param()

Set-StrictMode -Version Latest

function Write-Info { param($m) Write-Host "[INFO] $m" }
function Write-Err { param($m) Write-Host "[ERROR] $m" -ForegroundColor Red }

try {
    $remoteUrl = git remote get-url origin 2>$null
    if (-not $remoteUrl) { Write-Err "No 'origin' remote found. Add a remote and retry."; exit 1 }

    if ($remoteUrl -match '^https?://') {
        Write-Info "Detected HTTPS remote: $remoteUrl"

        # Try to set credential helper to manager-core, fallback to manager
        git config --global credential.helper manager-core 2>$null
        if ($LASTEXITCODE -ne 0) {
            git config --global credential.helper manager 2>$null
        }

        Write-Host "A browser window or credential prompt may open when we attempt a test push. Please authenticate if prompted."
        Write-Host "Running: git push origin HEAD (interactive)"
        git push origin HEAD 2>&1 | Out-Host
        if ($LASTEXITCODE -eq 0) { Write-Info "HTTPS auth configured successfully."; exit 0 } else { Write-Err "Push failed. Check credentials and retry."; exit 2 }

    } elseif ($remoteUrl -match '^[^:]+@') {
        Write-Info "Detected SSH remote: $remoteUrl"
        # Check ssh-agent
        $sshList = & ssh-add -l 2>&1
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($sshList)) {
            Write-Info "ssh-agent has keys loaded. Trying an SSH push to test..."
            git push origin HEAD 2>&1 | Out-Host
            if ($LASTEXITCODE -eq 0) { Write-Info "SSH auth test succeeded."; exit 0 } else { Write-Err "SSH push failed. Ensure your key is added to SSH agent and GitHub."; exit 3 }
        } else {
            Write-Err "ssh-agent does not list any keys. Run 'ssh-add <path-to-key>' and ensure key is added to GitHub/GitLab."; exit 4
        }
    } else {
        Write-Err "Could not detect remote type from: $remoteUrl"; exit 5
    }
} catch {
    Write-Err "Exception: $($_.Exception.Message)"; exit 10
}
