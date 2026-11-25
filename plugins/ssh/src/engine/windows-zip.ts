import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { errors } from "@huhu/contracts";

// The native library sees only files in a private Windows staging directory.
// Extraction writes numbered payloads. Archive member names never become OS paths here.
const script = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.IO.Compression
if ($env:HUHU_SSH_ZIP_ACTION -eq 'probe') { [Console]::Write('zip'); exit }
$root = $env:HUHU_SSH_ZIP_STAGE
$zipPath = [IO.Path]::Combine($root, 'payload.zip')
$limit = 16777216
if ($env:HUHU_SSH_ZIP_ACTION -eq 'create') {
  $rows = Get-Content -LiteralPath ([IO.Path]::Combine($root,'entries.json')) -Raw -Encoding UTF8 | ConvertFrom-Json
  $output = [IO.File]::Open($zipPath,[IO.FileMode]::CreateNew)
  try {
    $zip = [IO.Compression.ZipArchive]::new($output,[IO.Compression.ZipArchiveMode]::Create,$true)
    try {
      foreach ($row in $rows) {
        $entry = $zip.CreateEntry($row.name,[IO.Compression.CompressionLevel]::Optimal)
        $stamp = [DateTimeOffset]::FromUnixTimeMilliseconds([long]$row.mtime).ToLocalTime()
        if ($stamp.Year -lt 1980 -or $stamp.Year -gt 2107) { throw 'ZIP_TIMESTAMP_RANGE' }
        $entry.LastWriteTime = $stamp
        if ($row.directory) { continue }
        $from = [IO.File]::OpenRead([IO.Path]::Combine($root, ('{0}.bin' -f [int]$row.index)))
        $to = $entry.Open()
        try { $from.CopyTo($to) } finally { $to.Dispose(); $from.Dispose() }
      }
    } finally { $zip.Dispose() }
  } finally { $output.Dispose() }
  exit
}
$inputFile = [IO.File]::OpenRead($zipPath)
try {
  $zip = [IO.Compression.ZipArchive]::new($inputFile,[IO.Compression.ZipArchiveMode]::Read,$true)
  try {
    if ($zip.Entries.Count -gt 128) { throw 'ZIP_ENTRY_LIMIT' }
    $declared = 0L
    foreach ($entry in $zip.Entries) {
      $declared += $entry.Length
      if ($declared -gt $limit) { throw 'ZIP_BYTE_LIMIT' }
    }
    $index = 0
    $buffer = [byte[]]::new(65536)
    $actual = 0L
    $rows = [System.Collections.Generic.List[Object]]::new()
    foreach ($entry in $zip.Entries) {
      $directory = $entry.FullName.EndsWith('/')
      $digest = $null
      if (!$directory) {
        $part = [IO.Path]::Combine($root, ('{0}.bin' -f $index))
        $from = $entry.Open()
        $to = [IO.File]::Open($part,[IO.FileMode]::CreateNew)
        $count = 0L
        try {
          while (($size = $from.Read($buffer,0,$buffer.Length)) -gt 0) {
            $actual += $size
            $count += $size
            if ($actual -gt $limit -or $count -gt $entry.Length) { throw 'ZIP_BYTE_LIMIT' }
            $to.Write($buffer,0,$size)
          }
          if ($count -ne $entry.Length) { throw 'ZIP_MEMBER_LENGTH' }
        } finally { $to.Dispose(); $from.Dispose() }
        $digest = (Get-FileHash -LiteralPath $part -Algorithm SHA256).Hash.ToLowerInvariant()
      }
      $row = @{
        index = $index; name = $entry.FullName; directory = $directory; size = $entry.Length
        mtime = $entry.LastWriteTime.ToUnixTimeMilliseconds(); attributes = $entry.ExternalAttributes
      }
      if ($digest) { $row.sha256 = $digest }
      $rows.Add($row)
      $index++
    }
    [Console]::Write((ConvertTo-Json -InputObject $rows.ToArray() -Compress))
  } finally { $zip.Dispose() }
} finally { $inputFile.Dispose() }
`;

const execute = promisify(execFile);
const encoded = Buffer.from(script, "utf16le").toString("base64");

export async function windowsZip(action: "probe" | "create" | "read", stage: string, signal?: AbortSignal): Promise<string> {
  const windows = process.env["SystemRoot"];
  if (process.platform !== "win32" || !windows || !path.isAbsolute(windows)) throw errors.invalidInput("Windows 原生 ZIP 后端不可用");
  try {
    const { stdout } = await execute(path.join(windows, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
      env: { ...process.env, HUHU_SSH_ZIP_STAGE: stage, HUHU_SSH_ZIP_ACTION: action },
      windowsHide: true,
      encoding: "utf8",
      maxBuffer: 512 * 1024,
      timeout: 60_000,
      ...(signal ? { signal } : {}),
    });
    return stdout;
  } catch (error) {
    signal?.throwIfAborted();
    if (action === "probe") throw errors.invalidInput("系统 Windows PowerShell 或 .NET ZIP 组件不可用");
    const stderr = (error as { stderr?: string }).stderr ?? "";
    if (stderr.includes("ZIP_ENTRY_LIMIT")) throw errors.invalidInput("ZIP 条目超过上限");
    if (stderr.includes("ZIP_BYTE_LIMIT")) throw errors.invalidInput("ZIP 展开超过 16 MiB");
    if (stderr.includes("ZIP_TIMESTAMP_RANGE")) throw errors.invalidInput("源时间戳超出 ZIP 可保存的范围");
    throw errors.invalidInput(action === "read" ? "ZIP 损坏或包含当前后端不支持的内容" : "Windows ZIP 压缩失败");
  }
}
