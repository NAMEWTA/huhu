param([switch]$Test)
$ErrorActionPreference = 'Stop'
$buildEnvironment = @{
    GOWORK = 'off'; GOPROXY = 'off'; GOSUMDB = 'off'; GOTOOLCHAIN = 'local'
    GOTELEMETRY = 'off'; CGO_ENABLED = '0'; GOOS = 'windows'; GOARCH = 'amd64'; GOAMD64 = 'v1'
}
$previous = @{}
foreach ($name in $buildEnvironment.Keys) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $buildEnvironment[$name], 'Process')
}
Push-Location $PSScriptRoot
try {
    & go mod verify
    if ($LASTEXITCODE -ne 0) { throw 'Go module verification failed' }
    if ($Test) {
        & go test -mod=readonly ./...
        if ($LASTEXITCODE -ne 0) { throw 'Native tests failed' }
    }
    & go build -mod=readonly -trimpath -buildvcs=false -o bin/huhu-agent-pty.exe .
    if ($LASTEXITCODE -ne 0) { throw 'Native build failed' }
    & go version -m bin/huhu-agent-pty.exe
    if ($LASTEXITCODE -ne 0) { throw 'Native build metadata unavailable' }
} finally {
    Pop-Location
    foreach ($name in $buildEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
    }
}
