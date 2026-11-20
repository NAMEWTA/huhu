param(
    [Parameter(Mandatory = $true)][string]$Core,
    [Parameter(Mandatory = $true)][string]$Pi,
    [string[]]$Case = @()
)
$ErrorActionPreference = 'Stop'
$coreImage = (Resolve-Path -LiteralPath $Core).Path
$piEntry = (Resolve-Path -LiteralPath $Pi).Path
& (Join-Path $PSScriptRoot 'build.ps1') -Test
$previousCache = $env:TSX_DISABLE_CACHE
$env:TSX_DISABLE_CACHE = '1'
try {
    & node (Join-Path $PSScriptRoot 'tests/verify.cjs') $coreImage $piEntry @Case
    if ($LASTEXITCODE -ne 0) { throw 'Native Core verification failed' }
} finally {
    $env:TSX_DISABLE_CACHE = $previousCache
}
