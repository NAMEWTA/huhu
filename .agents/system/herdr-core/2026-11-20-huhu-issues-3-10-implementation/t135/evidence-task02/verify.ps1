param([string]$Task)
$evidence = Join-Path $Task 'evidence-task02'
$vitest = Join-Path $Task 'evidence-task01/vitest.ps1'
$failed = $false
& powershell.exe -NoProfile -File $vitest (Join-Path $evidence 'regressions.log') apps/engine/test/codex-dispatch.live.test.ts apps/engine/test/task-dispatch.live.test.ts plugins/agent-cli/test/dispatch.live.test.ts plugins/agent-cli/test/launch.live.test.ts plugins/agent-cli/test/sessions.test.ts plugins/agent-cli/test/launch-reconcile.test.ts plugins/tasks/test/agent-dispatch-executor.test.ts apps/desktop/test/engine-supervisor.test.ts
Write-Output "Regressions exited $LASTEXITCODE"
if ($LASTEXITCODE -ne 0) { $failed = $true }
& powershell.exe -NoProfile -File (Join-Path $evidence 'real-codex.ps1') $evidence
Write-Output "Real Codex probe exited $LASTEXITCODE"
if ($LASTEXITCODE -ne 0) { $failed = $true }
foreach ($name in 'plugins/agent-cli','plugins/tasks','apps/engine','apps/desktop') {
  Write-Output "Types $name"
  node node_modules/typescript/bin/tsc --noEmit -p "$name/tsconfig.json"
  if ($LASTEXITCODE -ne 0) { $failed = $true }
}
if ($failed) { exit 1 }