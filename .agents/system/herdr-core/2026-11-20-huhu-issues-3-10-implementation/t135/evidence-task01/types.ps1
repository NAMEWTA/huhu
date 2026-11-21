$ErrorActionPreference = 'Stop'
$failed = $false
foreach ($name in 'packages/contracts','packages/kernel','plugins/agent-cli','plugins/tasks','apps/engine') {
  Write-Output "== $name =="
  node node_modules/typescript/bin/tsc --noEmit -p "$name/tsconfig.json"
  if ($LASTEXITCODE -ne 0) { $failed = $true }
}
if ($failed) { exit 1 }