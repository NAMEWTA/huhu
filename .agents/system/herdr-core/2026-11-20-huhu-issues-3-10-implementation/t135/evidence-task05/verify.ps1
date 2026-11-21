param([string]$Evidence, [ValidateSet('baseline','feature','raw','plan')][string]$Mode = 'baseline')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$install = Join-Path $env:APPDATA 'npm/node_modules/@openai/codex'
$codex = Get-ChildItem -LiteralPath $install -Recurse -Filter 'codex.exe' | Select-Object -First 1 -ExpandProperty FullName
$pin = 'CEFEA4FFEE1FFF04983A99C0DDA99944D8B380E891E740A28B32F4B815A6E0B7'
if ($null -eq $codex -or (Get-FileHash -LiteralPath $codex -Algorithm SHA256).Hash -ne $pin) { throw 'Codex pin mismatch' }
"Windows x64 pinned Codex SHA-256 $pin"
$ErrorActionPreference = 'Continue'
node (Join-Path $Evidence 'native-answer-probe.mjs') $codex $Mode 2>&1 | ForEach-Object { $_.ToString() } | Tee-Object -FilePath (Join-Path $Evidence "$Mode.log")
exit $LASTEXITCODE
