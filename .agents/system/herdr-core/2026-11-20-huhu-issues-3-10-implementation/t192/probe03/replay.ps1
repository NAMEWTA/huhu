param([string]$Integration = 'D:\Document\code\huhu\temp\issue-worktrees\integration')
$ErrorActionPreference = 'Stop'
$env:GOWORK = 'off'
$env:GOPROXY = 'off'
$env:GOSUMDB = 'off'
$env:GOTOOLCHAIN = 'local'
$env:CGO_ENABLED = '0'
$env:TSX_DISABLE_CACHE = '1'
$repository = & git -C $PSScriptRoot rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0) { throw 'Could not locate repository' }
$run = Join-Path $repository ('temp/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t192/task03/replay-' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($run)
$fixture = Join-Path $run 'fixture.exe'
$cache = Join-Path $PSScriptRoot ('huhu-t192-go-' + [guid]::NewGuid().ToString('N'))
$env:GOCACHE = Join-Path $cache 'cache'
$env:GOTMPDIR = Join-Path $cache 'tmp'
$env:GOTELEMETRY = 'off'
[void][IO.Directory]::CreateDirectory($env:GOTMPDIR)
try {
    Push-Location $PSScriptRoot
    try {
        & go build -mod=readonly -trimpath -buildvcs=false -o $fixture .
        if ($LASTEXITCODE -ne 0) { throw 'Offline Go build failed' }
    } finally { Pop-Location }
    Push-Location $Integration
    try {
        & node (Join-Path $PSScriptRoot 'run.cjs') $fixture
        if ($LASTEXITCODE -ne 0) { throw 'Probe failed' }
    } finally { Pop-Location }
} finally {
    if (Test-Path -LiteralPath $cache) {
        $resolved = (Resolve-Path -LiteralPath $cache).Path
        $parent = (Resolve-Path -LiteralPath $PSScriptRoot).Path.TrimEnd('\')
        if ((Split-Path $resolved -Parent) -ine $parent -or (Split-Path $resolved -Leaf) -notmatch '^huhu-t192-go-[a-f0-9]{32}$') { throw 'Unexpected scratch location' }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
