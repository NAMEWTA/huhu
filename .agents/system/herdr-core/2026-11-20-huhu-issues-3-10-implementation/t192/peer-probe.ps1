# Windows-only process identity check. The pipe transports no payload.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class HuhuPeerIdentityProbe {
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool GetNamedPipeClientProcessId(SafePipeHandle pipe, out uint pid);
}
'@
$name = 'huhu-t192-' + [guid]::NewGuid().ToString('N')
$server = [IO.Pipes.NamedPipeServerStream]::new($name, [IO.Pipes.PipeDirection]::InOut, 1,
    [IO.Pipes.PipeTransmissionMode]::Byte, [IO.Pipes.PipeOptions]::Asynchronous)
$code = @"
`$pipe = [IO.Pipes.NamedPipeClientStream]::new('.', '$name', [IO.Pipes.PipeDirection]::InOut)
try { `$pipe.Connect(5000); [void]`$pipe.ReadByte() } finally { `$pipe.Dispose() }
"@
$child = $null
try {
    $awaitPeer = $server.WaitForConnectionAsync()
    $exe = Join-Path $PSHOME 'powershell.exe'
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($code))
    $child = Start-Process -FilePath $exe -ArgumentList @('-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',$encoded) -PassThru -WindowStyle Hidden
    if (-not $awaitPeer.Wait(8000)) { throw 'Peer connection timed out' }
    [uint32]$peerId = 0
    if (-not [HuhuPeerIdentityProbe]::GetNamedPipeClientProcessId($server.SafePipeHandle, [ref]$peerId)) { throw 'Peer process query failed' }
    $observed = [Diagnostics.Process]::GetProcessById($peerId)
    try {
        $answer = [ordered]@{ peerPidMatchesLaunched = ($peerId -eq $child.Id); creationTimeMatches = ($observed.StartTime.ToUniversalTime().Ticks -eq $child.StartTime.ToUniversalTime().Ticks); childAliveDuringCheck = (-not $child.HasExited) }
    } finally { $observed.Dispose() }
    $server.Dispose()
    if (-not $child.WaitForExit(5000)) { throw 'Child did not exit' }
    $answer.childExitCode = $child.ExitCode
    if (-not ($answer.peerPidMatchesLaunched -and $answer.creationTimeMatches -and $answer.childAliveDuringCheck -and $child.ExitCode -eq 0)) { throw 'Unexpected peer identity' }
    [pscustomobject]$answer | ConvertTo-Json
} finally {
    $server.Dispose()
    if ($child) {
        if (-not $child.HasExited) { $child.Kill(); $child.WaitForExit() }
        $child.Dispose()
    }
}
