param([string]$Evidence)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Continue'
$env:NO_COLOR = '1'
node node_modules/electron-vite/bin/electron-vite.js build --config (Join-Path $Evidence 'original-main-config.mjs') 2>&1 | ForEach-Object { $_.ToString() } | Tee-Object -FilePath (Join-Path $Evidence 'electron-vite-main.log')
$buildExit = $LASTEXITCODE
if ($buildExit -ne 0) { exit $buildExit }
if (!(Test-Path -LiteralPath 'out/main/engine.js')) { throw 'The normal build did not produce engine.js' }
if (!(Select-String -Quiet -SimpleMatch -Pattern 'codex-dispatch/helper.cjs','"codex-dispatch", "helper.cjs"' -Path 'out/main/index.js')) {
  if (!(Select-String -Quiet -SimpleMatch 'HUHU_CODEX_DISPATCH_HELPER' -Path 'out/main/index.js')) { throw 'The desktop build did not include the helper path' }
}
$helper = (Resolve-Path '../../plugins/agent-cli/src/engine/codex-dispatch-helper.cjs').Path
if (!(Select-String -Quiet -SimpleMatch '../../plugins/agent-cli/src/engine/codex-dispatch-helper.cjs' -Path 'electron-builder.yml')) { throw 'Helper resource is missing from packaging' }
$engine = Get-FileHash -LiteralPath 'out/main/engine.js'
$resource = Get-FileHash -LiteralPath $helper
Write-Output "engine.js SHA-256 $($engine.Hash)"
Write-Output "builder helper source SHA-256 $($resource.Hash)"