param (
    [string]$AgentName
)

$metadataPath = ".agent/agents/agent-metadata.json"
$metadata = Get-Content $metadataPath | ConvertFrom-Json
$timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ss"

if ($metadata.$AgentName) {
    $metadata.$AgentName.lastRun = $timestamp
    $metadata | ConvertTo-Json -Depth 3 | Set-Content $metadataPath
    Write-Output "Updated metadata for $AgentName"
} else {
    Write-Output "Agent '$AgentName' not found in metadata"
}
