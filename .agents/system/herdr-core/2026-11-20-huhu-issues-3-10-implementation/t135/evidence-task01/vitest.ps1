param([string]$LogPath)
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$env:CI = 'true'
$env:NO_COLOR = '1'
$env:HUHU_AGENT_LAUNCH_TEST_BIN = (Resolve-Path '../integration/apps/desktop/resources/herdr/win32-x64/herdr-core.exe').Path
if ((Get-FileHash $env:HUHU_AGENT_LAUNCH_TEST_BIN).Hash -ne '8C5C088EDA5C441502FA58714277A250E38103C66180376EF00D63D6CAB03F8D') { throw 'Unexpected Windows Core binary' }
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --minWorkers=1 --reporter verbose @args 2>&1 | ForEach-Object { $_.ToString() } | Tee-Object -FilePath $LogPath
exit $LASTEXITCODE