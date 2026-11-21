param([string]$Task)
$evidence = Join-Path $Task 'evidence-task06'
$vitest = Join-Path $Task 'evidence-task01/vitest.ps1'
$failed = $false
& powershell.exe -NoProfile -File $vitest (Join-Path $evidence 'regressions.log') plugins/agent-cli/test/native-stop.live.test.ts plugins/agent-cli/test/native-receipts.live.test.ts apps/engine/test/codex-dispatch.live.test.ts plugins/agent-cli/test/dispatch.live.test.ts apps/engine/test/task-dispatch.live.test.ts plugins/agent-cli/test/sessions.test.ts plugins/agent-cli/test/launch-reconcile.test.ts plugins/agent-cli/test/waiting.test.ts plugins/agent-cli/test/execution-receipts.test.ts packages/contracts/test/execution-receipt.test.ts
$status = $LASTEXITCODE
Write-Output "Regressions exited $status"
if ($status -ne 0) { $failed = $true }
foreach ($name in 'plugins/agent-cli','apps/engine') {
  node node_modules/typescript/bin/tsc --noEmit -p "$name/tsconfig.json"
  $status = $LASTEXITCODE
  Write-Output "Typecheck $name exited $status"
  if ($status -ne 0) { $failed = $true }
}
$files = git diff --name-only 162fa0dc3af5ccf03b20d701a30b2bf02612fa14
$files += git ls-files --others --exclude-standard
node node_modules/oxfmt/bin/oxfmt --check @files
$status = $LASTEXITCODE
Write-Output "Formatter exited $status"
if ($status -ne 0) { $failed = $true }
node node_modules/oxlint/bin/oxlint -c oxlint.json @files
$status = $LASTEXITCODE
Write-Output "Lint exited $status"
if ($status -ne 0) { $failed = $true }
git diff --check 162fa0dc3af5ccf03b20d701a30b2bf02612fa14
$status = $LASTEXITCODE
Write-Output "Git whitespace check exited $status"
if ($status -ne 0) { $failed = $true }
if ($failed) { exit 1 }
exit 0
