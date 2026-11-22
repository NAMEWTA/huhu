param([string]$Evidence)
$ErrorActionPreference = 'Stop'
$env:HUHU_AGENT_LAUNCH_TEST_BIN = (Resolve-Path '../integration/apps/desktop/resources/herdr/win32-x64/herdr-core.exe').Path
if ((Get-FileHash $env:HUHU_AGENT_LAUNCH_TEST_BIN).Hash -ne '8C5C088EDA5C441502FA58714277A250E38103C66180376EF00D63D6CAB03F8D') { throw 'Core pin mismatch' }
$env:HUHU_CODEX_REAL_TEST_BIN = (Get-ChildItem "$env:APPDATA/npm/node_modules/@openai/codex" -Recurse -Filter 'codex.exe' | Select-Object -First 1 -ExpandProperty FullName)
$env:HUHU_CODEX_TEST_ELECTRON = (Resolve-Path '../integration/apps/desktop/node_modules/electron/dist/electron.exe').Path
$loader = ([uri](Resolve-Path 'plugins/tasks/node_modules/tsx/dist/loader.mjs').Path).AbsoluteUri
node --import $loader (Join-Path $Evidence 'real-codex.mjs')
exit $LASTEXITCODE
