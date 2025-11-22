param([string]$TaskName = 'realtime')

Write-Host ('🔍 Validating strategy registry...')
powershell -ExecutionPolicy Bypass -File '.agent\validators\validate-strategy-registry.ps1'

switch ($TaskName) {
    'realtime' {
        Write-Host ('Running realtime agent...')
        powershell -ExecutionPolicy Bypass -File '.agent\agents\realtime-agent.ps1'
        break
    }
    'strategy-dryrun' {
    powershell -ExecutionPolicy Bypass -File ".agent/agents/strategy-dryrun.ps1"
    break
  }
  'shadow-write' {
    powershell -ExecutionPolicy Bypass -File ".agent/agents/shadow-writer.ps1"
    break
 }

  default {
        Write-Host ('Unknown task: {0}' -f $TaskName)
        break
    }
}
