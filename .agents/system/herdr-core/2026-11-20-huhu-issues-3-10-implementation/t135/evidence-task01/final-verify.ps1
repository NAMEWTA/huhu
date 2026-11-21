param([string]$Evidence)
& powershell.exe -NoProfile -File (Join-Path $Evidence 'vitest.ps1') (Join-Path $Evidence 'final-runtime.log') apps/engine/test/task-dispatch.live.test.ts plugins/tasks/test/agent-dispatch-executor.test.ts plugins/tasks/test/shared.test.ts
$runtimeExit = $LASTEXITCODE
Write-Output "Runtime suite exited $runtimeExit"
& powershell.exe -NoProfile -File (Join-Path $Evidence 'types.ps1')
$typeExit = $LASTEXITCODE
Write-Output "Type checks exited $typeExit"
if ($runtimeExit -ne 0 -or $typeExit -ne 0) { exit 1 }