param([string]$Task)
$evidence = Join-Path $Task 'evidence-task03'
$vitest = Join-Path $Task 'evidence-task01/vitest.ps1'
$failed = $false
& powershell.exe -NoProfile -File $vitest (Join-Path $evidence 'regressions.log') plugins/agent-cli/test/native-receipts.live.test.ts plugins/agent-cli/test/execution-receipts.test.ts packages/contracts/test/execution-receipt.test.ts plugins/agent-cli/test/dispatch.live.test.ts plugins/agent-cli/test/sessions.test.ts plugins/agent-cli/test/waiting.test.ts apps/engine/test/codex-dispatch.live.test.ts apps/engine/test/task-dispatch.live.test.ts
Write-Output "Regressions exited $LASTEXITCODE"
if ($LASTEXITCODE -ne 0) { $failed = $true }
foreach ($name in 'packages/contracts','plugins/agent-cli','apps/engine') {
  Write-Output "Types $name"
  node node_modules/typescript/bin/tsc --noEmit -p "$name/tsconfig.json"
  if ($LASTEXITCODE -ne 0) { $failed = $true }
}
if ($failed) { exit 1 }