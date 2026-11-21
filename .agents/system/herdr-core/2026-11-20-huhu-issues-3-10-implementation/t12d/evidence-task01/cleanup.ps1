param([string[]]$Panes = @())
$ErrorActionPreference = 'Stop'
$tempRoot = (Resolve-Path ([IO.Path]::GetTempPath())).Path.TrimEnd('\')
$log = Join-Path $PSScriptRoot 'cleanup.log'
$utf8 = New-Object Text.UTF8Encoding($false)
function Record($line) {
  [IO.File]::AppendAllText($log, $line + [Environment]::NewLine, $utf8)
  Write-Output $line
}
function Unlink-Modules($directory) {
  foreach ($entry in (Get-ChildItem -LiteralPath $directory -Directory -Force)) {
    if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { [IO.Directory]::Delete($entry.FullName) }
    else { Unlink-Modules $entry.FullName }
  }
}
foreach ($leaf in 'huhu-t12d-red-550f21f0','huhu-t12d-w12-red-a6f35761','huhu-t12d-standalone-ij2_y923') {
  $candidate = Join-Path $tempRoot $leaf
  if (!(Test-Path -LiteralPath $candidate)) { continue }
  $resolved = (Resolve-Path -LiteralPath $candidate).Path
  if ($resolved -ne $candidate -or (Split-Path -Parent $resolved) -ne $tempRoot -or ((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw "Unexpected cleanup target $resolved"
  }
  Unlink-Modules $resolved
  Remove-Item -LiteralPath $resolved -Recurse -Force
  Record "removed validation scratch: $resolved"
}
foreach ($terminal in $Panes) {
  $ErrorActionPreference = 'Continue'
  $raw = hc get $terminal 2>$null
  $status = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($status) { continue }
  $child = $raw | ConvertFrom-Json
  if ($child.parent -ne 't12d' -or $child.name -notlike 't12d-*' -or $child.state -ne 'finished') { throw "Unexpected terminal $terminal" }
  $null = hc rm $terminal
  if ($LASTEXITCODE) { throw "hc rm failed for $terminal" }
  Record "removed test pane: $terminal $($child.name) exit=$($child.exit_code)"
}
$bin = 'D:/Document/code/huhu/temp/issue-worktrees/integration/apps/desktop/resources/herdr/win32-x64/herdr-core.exe'
$endpoints = Get-ChildItem -LiteralPath $PSScriptRoot -File -Filter '*.log' |
  Where-Object Name -ne 'cleanup.log' |
  Get-Content -Encoding utf8 |
  Where-Object { $_.StartsWith('{"endpoint":') -and $_.Contains('"stopped":5') } |
  ForEach-Object { ($_ | ConvertFrom-Json).endpoint } |
  Where-Object { $_ -match '^\\\\\.\\pipe\\huhu-[a-z0-9]{8}-[a-z0-9]{4}$' } |
  Sort-Object -Unique
$originalSocket = $env:HC_SOCKET
try {
  foreach ($endpoint in $endpoints) {
    $env:HC_SOCKET = $endpoint
    $ErrorActionPreference = 'Continue'
    $reply = (& $bin server status 2>&1 | Out-String)
    $status = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($status -ne 5 -or $reply -notmatch 'os error 2') { throw "Test pipe still present: $endpoint (exit=$status)" }
    Record "test pipe absent: $endpoint exit=$status os_error=2"
  }
} finally { $env:HC_SOCKET = $originalSocket }
