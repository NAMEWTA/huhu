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
$ref = '3d9f6079cb4b7f55a68de1072b7d921eb5dbbc36'
$lock = git -C $repo rev-parse "${ref}:pnpm-lock.yaml"
if ($LASTEXITCODE -or $lock -ne $dependencyLock) { throw 'Committed dependency locks differ' }
$fixturePath = 'plugins/automations/test/task-scan-occurrences.test.ts'
$evidence = (New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot 'evidence-task05') -Force).FullName
$tempRoot = (Get-Item -LiteralPath ([IO.Path]::GetTempPath())).FullName.TrimEnd('\')
$run = (New-Item -ItemType Directory -Path (Join-Path $tempRoot ('huhu-t161-occurrences-' + [guid]::NewGuid().ToString('N').Substring(0,8)))).FullName
$log = Join-Path $evidence 'occurrences.log'
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
  foreach ($file in @($fixturePath,'plugins/automations/src/engine/task-scan-occurrences.ts','plugins/automations/src/engine/index.ts','plugins/automations/src/engine/service.ts','plugins/tasks/src/engine/dispatch.ts','plugins/tasks/test/persistence-http.test.ts','apps/engine/test/engine.test.ts')) {
    $expectedHash = git -C $repo rev-parse "${ref}:$file"
    if ($LASTEXITCODE) { throw "No committed blob for $file" }
    $archiveHash = git -C $repo hash-object --no-filters (Join-Path $snapshot $file)
    if ($LASTEXITCODE -or $expectedHash -ne $archiveHash) { throw "Archive file differs from Git object: $file" }
    Record "archive_file=$file blob=$archiveHash"
  }

  Push-Location $snapshot
  try {
    $vitest = @('--config.verify-deps-before-run=false','--config.offline=true','--config.ignore-scripts=true','--config.registry=http://127.0.0.1:1/','exec','vitest','run','--pool=threads','--maxWorkers=1','--minWorkers=1','--no-file-parallelism','--reporter=verbose')
    $suites = @(
      @{ name = 'automations'; filters = @('--project','@huhu/plugin-automations') },
      @{ name = 'tasks'; filters = @('--project','@huhu/plugin-tasks','plugins/tasks/test/persistence-http.test.ts') },
      @{ name = 'engine'; filters = @('--project','@huhu/engine','apps/engine/test/engine.test.ts','-t','automations.update|\u5ba1\u8ba1\u56de\u5f52\uff1a\u5916\u90e8\u5165\u53e3\u5373\u4f7f\u88ab\u5f00\u653e automations') }
    )
    $code = 0
    foreach ($suite in $suites) {
      $argsForSuite = $vitest + $suite.filters
      Record "suite=$($suite.name) pnpm $($argsForSuite -join ' ')"
      $ErrorActionPreference = 'Continue'
      & $pnpm @argsForSuite 2>&1 | ForEach-Object { Record $_ }
      $suiteCode = $LASTEXITCODE
      $ErrorActionPreference = 'Stop'
      Record "suite=$($suite.name) vitest_exit=$suiteCode"
      if ($suiteCode) { $code = 1 }
    }
  } finally { Pop-Location }

  $leftovers = @(Get-ChildItem -LiteralPath $isolatedTemp -Directory | Where-Object Name -like 'huhu-*')
  @("vitest_exit=$code","fixture_dirs_remaining=$($leftovers.Count)") | Set-Content -LiteralPath $cleanupLog
  if ($leftovers.Count) { $code = 1 }
} catch {
  Record "runner_error=$_"
  $code = 1
} finally {
  $writer.Dispose()
  $resolved = (Resolve-Path -LiteralPath $run).Path
  if ($resolved -ne $run -or (Split-Path -Parent $resolved) -ne $tempRoot -or (Split-Path -Leaf $resolved) -notmatch '^huhu-t161-occurrences-[0-9a-f]{8}$' -or ((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
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
