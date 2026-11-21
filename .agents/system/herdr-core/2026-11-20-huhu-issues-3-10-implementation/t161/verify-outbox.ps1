param(
  [Parameter(Mandatory=$true)][string]$Repo,
  [Parameter(Mandatory=$true)][string]$PnpmExe
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Diagnostics.Process]::GetCurrentProcess().PriorityClass = [Diagnostics.ProcessPriorityClass]::BelowNormal
$repo = (Resolve-Path -LiteralPath $Repo).Path
$dependencyRoot = (Resolve-Path -LiteralPath (Join-Path $repo 'temp/issue-worktrees/safe-personal')).Path
$dependencyRef = git -C $dependencyRoot rev-parse HEAD
if ($LASTEXITCODE) { throw 'Cannot resolve installed dependency checkout' }
$dependencyLock = git -C $dependencyRoot rev-parse 'HEAD:pnpm-lock.yaml'
if ($LASTEXITCODE) { throw 'Cannot resolve installed dependency lock' }
$ref = '564a9b680bd48757ccf8691faf86c7572949b58a'
$lock = git -C $repo rev-parse "${ref}:pnpm-lock.yaml"
if ($LASTEXITCODE -or $lock -ne $dependencyLock) { throw 'Committed dependency locks differ' }
$fixturePath = 'plugins/mail/test/outbox-engine.test.ts'
$evidence = (New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot 'evidence-task04') -Force).FullName
$tempRoot = (Get-Item -LiteralPath ([IO.Path]::GetTempPath())).FullName.TrimEnd('\')
$run = (New-Item -ItemType Directory -Path (Join-Path $tempRoot ('huhu-t161-outbox-' + [guid]::NewGuid().ToString('N').Substring(0,8)))).FullName
$log = Join-Path $evidence 'outbox.log'
$cleanupLog = Join-Path $evidence 'cleanup.log'

function Link-Modules($from, $to, $snapshot) {
  if (!(Test-Path -LiteralPath $from)) { return }
  New-Item -ItemType Directory -Path $to -Force | Out-Null
  foreach ($entry in (Get-ChildItem -LiteralPath $from -Force -Directory)) {
    if ($entry.Name.StartsWith('.')) { continue }
    if ($entry.Name.StartsWith('@')) {
      Link-Modules $entry.FullName (Join-Path $to $entry.Name) $snapshot
      continue
    }
    $target = $entry.FullName
    $linked = [string](@($entry.Target)[0])
    if ($linked.StartsWith($dependencyRoot + '\', [StringComparison]::OrdinalIgnoreCase) -and !$linked.StartsWith($dependencyRoot + '\node_modules\', [StringComparison]::OrdinalIgnoreCase)) {
      $target = Join-Path $snapshot $linked.Substring($dependencyRoot.Length + 1)
      if (!(Test-Path -LiteralPath (Join-Path $target 'package.json'))) {
        throw "Workspace dependency absent from frozen source: $linked"
      }
    }
    New-Item -ItemType Junction -Path (Join-Path $to $entry.Name) -Target $target | Out-Null
  }
}

function Unlink-Modules($directory) {
  foreach ($entry in (Get-ChildItem -LiteralPath $directory -Directory -Force)) {
    if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { [IO.Directory]::Delete($entry.FullName) }
    else { Unlink-Modules $entry.FullName }
  }
}

$writer = New-Object IO.StreamWriter($log, $false, [Text.UTF8Encoding]::new($false))
$writer.AutoFlush = $true
function Record($line) { $writer.WriteLine([string]$line); Write-Host $line }
$code = 1
try {
  $snapshot = (New-Item -ItemType Directory -Path (Join-Path $run 'src')).FullName
  $isolatedTemp = (New-Item -ItemType Directory -Path (Join-Path $run 'fixtures')).FullName
  $env:TEMP = $isolatedTemp
  $env:TMP = $isolatedTemp
  $env:CI = 'true'
  $env:NO_COLOR = '1'
  $env:npm_config_offline = 'true'
  $pnpm = (Resolve-Path -LiteralPath $PnpmExe).Path
  $pnpmVersion = & $pnpm --version
  if ($LASTEXITCODE -or $pnpmVersion -ne '12.10.1') { throw "Unexpected pnpm version: $pnpmVersion" }
  Record "pnpm_version=$pnpmVersion pnpm_sha256=$((Get-FileHash -LiteralPath $pnpm).Hash)"
  $env:HUHU_MAIL_PROTOCOL_FIXTURE = (Resolve-Path -LiteralPath (Join-Path $repo 'temp/issue-baseline/mail-protocol')).Path
  $smtpPackage = Get-Content -Raw -LiteralPath (Join-Path $env:HUHU_MAIL_PROTOCOL_FIXTURE 'node_modules/nodemailer/package.json') | ConvertFrom-Json
  $smtpLockPath = Join-Path $env:HUHU_MAIL_PROTOCOL_FIXTURE 'package-lock.json'
  $smtpPinJson = node -p "JSON.stringify(require(process.argv[1]).packages['node_modules/nodemailer'])" $smtpLockPath
  if ($LASTEXITCODE) { throw 'Cannot read local SMTP fixture lock entry' }
  $smtpPin = $smtpPinJson | ConvertFrom-Json
  if ($smtpPackage.version -ne '10.6.0' -or $smtpPackage.version -ne $smtpPin.version) { throw 'Unexpected local SMTP fixture dependency' }
  Record "smtp_fixture=$env:HUHU_MAIL_PROTOCOL_FIXTURE nodemailer=$($smtpPackage.version) license=$($smtpPackage.license) fixture_integrity=$($smtpPin.integrity)"
  Record "candidate=$ref dependencies=$dependencyRef lock=$lock node=$(node --version) platform=$(node -p process.platform) architecture=$(node -p process.arch) snapshot=$snapshot"
  $zip = Join-Path $run 'candidate.zip'
  git -C $repo archive --format=zip -o $zip $ref
  if ($LASTEXITCODE) { throw 'Git archive failed' }
  python -m zipfile -e $zip $snapshot
  if ($LASTEXITCODE) { throw 'Git archive extraction failed' }
  Remove-Item -LiteralPath $zip
  Link-Modules (Join-Path $dependencyRoot 'node_modules') (Join-Path $snapshot 'node_modules') $snapshot
  foreach ($group in 'packages','plugins','apps','vendor','tests') {
    foreach ($project in (Get-ChildItem -LiteralPath (Join-Path $snapshot $group) -Directory -ErrorAction SilentlyContinue)) {
      Link-Modules (Join-Path $dependencyRoot "$group/$($project.Name)/node_modules") (Join-Path $project.FullName 'node_modules') $snapshot
    }
  }
  $binDir = (New-Item -ItemType Directory -Path (Join-Path $snapshot 'node_modules/.bin')).FullName
  $installedBin = Join-Path $dependencyRoot 'node_modules/.bin'
  foreach ($shim in (Get-ChildItem -LiteralPath $installedBin -File -Filter 'vitest*')) {
    Copy-Item -LiteralPath $shim.FullName -Destination $binDir
  }
  if (!(Test-Path -LiteralPath (Join-Path $binDir 'vitest.CMD'))) { throw 'Missing installed Vitest shim' }
  foreach ($file in @($fixturePath,'plugins/mail/test/fixtures/smtp.ts','plugins/mail/src/engine/outbox.ts','plugins/mail/src/engine/smtp.ts','plugins/mail/src/engine/drafts.ts')) {
    $expectedHash = git -C $repo rev-parse "${ref}:$file"
    if ($LASTEXITCODE) { throw "No committed blob for $file" }
    $archiveHash = git -C $repo hash-object --no-filters (Join-Path $snapshot $file)
    if ($LASTEXITCODE -or $expectedHash -ne $archiveHash) { throw "Archive file differs from Git object: $file" }
    Record "archive_file=$file blob=$archiveHash"
  }

  Push-Location $snapshot
  try {
    $vitest = @('--config.verify-deps-before-run=false','--config.offline=true','--config.ignore-scripts=true','--config.registry=http://127.0.0.1:1/','exec','vitest','run','--pool=threads','--maxWorkers=1','--minWorkers=1','--no-file-parallelism','--reporter=verbose',$fixturePath)
    Record "pnpm $($vitest -join ' ')"
    $ErrorActionPreference = 'Continue'
    & $pnpm @vitest 2>&1 | ForEach-Object { Record $_ }
    $code = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    Record "vitest_exit=$code"
  } finally { Pop-Location }

  $leftovers = @(Get-ChildItem -LiteralPath $isolatedTemp -Directory | Where-Object Name -like 'huhu-mail-outbox-*')
  @("vitest_exit=$code","fixture_dirs_remaining=$($leftovers.Count)") | Set-Content -LiteralPath $cleanupLog
  if ($leftovers.Count) { $code = 1 }
} catch {
  Record "runner_error=$_"
  $code = 1
} finally {
  $writer.Dispose()
  $resolved = (Resolve-Path -LiteralPath $run).Path
  if ($resolved -ne $run -or (Split-Path -Parent $resolved) -ne $tempRoot -or (Split-Path -Leaf $resolved) -notmatch '^huhu-t161-outbox-[0-9a-f]{8}$' -or ((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'Unexpected snapshot cleanup target'
  }
  Unlink-Modules $resolved
  if (Get-ChildItem -LiteralPath $resolved -Recurse -Force -Attributes ReparsePoint | Select-Object -First 1) { throw 'Unexpected dependency junction' }
  Add-Type -AssemblyName Microsoft.VisualBasic
  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($resolved, [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)
  if (Test-Path -LiteralPath $resolved) { throw 'Snapshot remains at its original path' }
  "snapshot_removed=True method=Windows_Recycle_Bin path=$resolved" | Add-Content -LiteralPath $cleanupLog
}
exit $code
