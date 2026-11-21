param([string]$Integration = 'D:\Document\code\huhu\temp\issue-worktrees\integration')
$ErrorActionPreference = 'Stop'
$env:GOWORK = 'off'
$env:GOPROXY = 'off'
$env:GOSUMDB = 'off'
$env:GOTOOLCHAIN = 'local'
$env:CGO_ENABLED = '0'
$env:TSX_DISABLE_CACHE = '1'
$cache = Join-Path ([IO.Path]::GetTempPath()) ('huhu-t192-go-' + [guid]::NewGuid().ToString('N'))
$env:GOCACHE = $cache
try {
    Push-Location $PSScriptRoot
    try {
        & go build -mod=readonly -trimpath -buildvcs=false -o fixture.exe .
        if ($LASTEXITCODE -ne 0) { throw 'Offline Go build failed' }
    } finally { Pop-Location }
    Push-Location $Integration
    try {
        & node (Join-Path $PSScriptRoot 'run.cjs')
        if ($LASTEXITCODE -ne 0) { throw 'Probe failed' }
    } finally { Pop-Location }
} finally {
    if (Test-Path -LiteralPath $cache) {
        $resolved = (Resolve-Path -LiteralPath $cache).Path
        $parent = (Resolve-Path -LiteralPath ([IO.Path]::GetTempPath())).Path.TrimEnd('\')
        if ((Split-Path $resolved -Parent) -ine $parent -or (Split-Path $resolved -Leaf) -notmatch '^huhu-t192-go-[a-f0-9]{32}$') { throw 'Unexpected scratch location' }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
