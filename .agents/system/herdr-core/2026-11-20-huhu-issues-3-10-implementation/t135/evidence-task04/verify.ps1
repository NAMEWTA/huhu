param([string]$Task)
$evidence = Join-Path $Task 'evidence-task04'
$vitest = Join-Path $Task 'evidence-task01/vitest.ps1'
$failed = $false
& powershell.exe -NoProfile -File $vitest (Join-Path $evidence 'regressions.log') plugins/agent-cli/test/native-receipts.live.test.ts plugins/agent-cli/test/execution-receipts.test.ts packages/contracts/test/execution-receipt.test.ts plugins/agent-cli/test/dispatch.live.test.ts plugins/agent-cli/test/sessions.test.ts plugins/agent-cli/test/waiting.test.ts apps/engine/test/codex-dispatch.live.test.ts apps/engine/test/task-dispatch.live.test.ts
Write-Output "Regressions exited $LASTEXITCODE"
if ($LASTEXITCODE -ne 0) { $failed = $true }
foreach ($name in 'packages/contracts','plugins/agent-cli','apps/engine') {
  node node_modules/typescript/bin/tsc --noEmit -p "$name/tsconfig.json"
  Write-Output "Types $name exited $LASTEXITCODE"
  if ($LASTEXITCODE -ne 0) { $failed = $true }
}
$files = git diff --name-only 77a52b6b2a7d92d41ef7fe1dd9a0b3f006d85c90
$files += git ls-files --others --exclude-standard
node node_modules/oxfmt/bin/oxfmt --check @files
Write-Output "Formatter exited $LASTEXITCODE"
if ($LASTEXITCODE -ne 0) { $failed = $true }
node node_modules/oxlint/bin/oxlint -c oxlint.json @files
Write-Output "Lint exited $LASTEXITCODE"
if ($LASTEXITCODE -ne 0) { $failed = $true }
git diff --check 77a52b6b2a7d92d41ef7fe1dd9a0b3f006d85c90
Write-Output "Git whitespace check exited $LASTEXITCODE"
if ($LASTEXITCODE -ne 0) { $failed = $true }
if ($failed) { exit 1 }
exit 0