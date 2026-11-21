param([string]$Repo)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Diagnostics.Process]::GetCurrentProcess().PriorityClass = [Diagnostics.ProcessPriorityClass]::BelowNormal
$repo = (Resolve-Path -LiteralPath $Repo).Path
$dependencyRoot = (Resolve-Path -LiteralPath (Join-Path $repo 'temp/issue-worktrees/integration')).Path
$dependencyRef = git -C $dependencyRoot rev-parse HEAD
if ($LASTEXITCODE) { throw 'Cannot resolve installed dependency checkout' }
$dependencyLock = git -C $dependencyRoot rev-parse 'HEAD:pnpm-lock.yaml'
if ($LASTEXITCODE) { throw 'Cannot resolve installed dependency lock' }
$sha = '8C5C088EDA5C441502FA58714277A250E38103C66180376EF00D63D6CAB03F8D'
$core = Join-Path $dependencyRoot 'apps/desktop/resources/herdr/win32-x64/herdr-core.exe'
if ((Get-FileHash -LiteralPath $core).Hash -ne $sha) { throw 'Unexpected local fixture Core binary' }
$tempRoot = (Get-Item -LiteralPath ([IO.Path]::GetTempPath())).FullName.TrimEnd('\')
$run = (New-Item -ItemType Directory -Path (Join-Path $tempRoot ('huhu-t161-' + [guid]::NewGuid().ToString('N').Substring(0,8)))).FullName
$evidence = Join-Path $PSScriptRoot 'evidence-task01'

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

function Run-Fixture($name, $ref, $tests) {
  $log = Join-Path $evidence ($name + '.log')
  $writer = New-Object IO.StreamWriter($log, $false, [Text.UTF8Encoding]::new($false))
  $writer.AutoFlush = $true
  function Record($line) { $writer.WriteLine([string]$line); Write-Host $line }
  $code = 1
  try {
    $lock = git -C $repo rev-parse "${ref}:pnpm-lock.yaml"
    if ($LASTEXITCODE -or $lock -ne $dependencyLock) { throw 'Committed dependency locks differ' }
    $snapshot = (New-Item -ItemType Directory -Path (Join-Path $run $name)).FullName
    Record "candidate=$ref dependencies=$dependencyRef lock=$lock node=$(node --version) architecture=$(node -p process.arch) snapshot=$snapshot"
    $zip = Join-Path $run ($name + '.zip')
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

    $fixtureFiles = $tests
    if ($name -eq 'agent') { $fixtureFiles += 'plugins/agent-cli/test/fixtures/codex-receipts-provider.cjs' }
    foreach ($testFile in $fixtureFiles) {
      $fixtureHash = git -C $repo rev-parse "${ref}:$testFile"
      $snapshotHash = git -C $repo hash-object --no-filters (Join-Path $snapshot $testFile)
      if ($LASTEXITCODE -or $fixtureHash -ne $snapshotHash) { throw "Fixture differs from Git object: $testFile" }
      Record "fixture=$testFile blob=$snapshotHash"
    }
    $env:HUHU_AGENT_LAUNCH_TEST_BIN = if ($name -eq 'agent') { Join-Path $run 'herdr-core.exe' } else { $null }
    $env:CI = 'true'
    $env:NO_COLOR = '1'
    # Existing fixtures use a temp Vault and, for Agent, an isolated Core and provider home.
    Push-Location $snapshot
    try {
      $testArgs = @('node_modules/vitest/vitest.mjs','run','--pool=threads','--maxWorkers=1','--minWorkers=1','--no-file-parallelism','--reporter=verbose') + $tests
      Record "node $($testArgs -join ' ')"
      $ErrorActionPreference = 'Continue'
      node @testArgs 2>&1 | ForEach-Object { Record $_ }
      $code = $LASTEXITCODE
      $ErrorActionPreference = 'Stop'
      Record "vitest_exit=$code"
    } finally { Pop-Location }
  } catch {
    Record "runner_error=$_"
    $code = 1
  } finally {
    $writer.Dispose()
  }
  return $code
}

$exitCode = 1
try {
  New-Item -ItemType Directory -Path $evidence -Force | Out-Null
  $isolatedTemp = (New-Item -ItemType Directory -Path (Join-Path $run 'fixtures')).FullName
  $env:TEMP = $isolatedTemp
  $env:TMP = $isolatedTemp
  $tempCore = Join-Path $run 'herdr-core.exe'
  Copy-Item -LiteralPath $core -Destination $tempCore
  if ((Get-FileHash -LiteralPath $tempCore).Hash -ne $sha) { throw 'Fixture Core copy differs' }
  "core_sha256=$sha" | Set-Content -LiteralPath (Join-Path $evidence 'cleanup.log')
  $agent = Run-Fixture 'agent' 'da653169aa2f71aabe08085989e951aa885bc1bb' @('plugins/agent-cli/test/native-stop.live.test.ts')
  $mail = Run-Fixture 'mail' '37bcc525c913afc1fa6d5180c2bff6b771fc8ae4' @('plugins/mail/test/drafts-engine.test.ts','plugins/mail/test/accounts-engine.test.ts')
  $leftovers = @(Get-ChildItem -LiteralPath $isolatedTemp -Directory | Where-Object {$_.Name -match '^huhu-(native-stop|mail-drafts|mail-native)'})
  @("agent_exit=$agent","mail_exit=$mail","fixture_dirs_remaining=$($leftovers.Count)") | Add-Content -LiteralPath (Join-Path $evidence 'cleanup.log')
  if ($agent -eq 0 -and $mail -eq 0 -and !$leftovers.Count) { $exitCode = 0 }
} finally {
  $resolved = (Resolve-Path -LiteralPath $run).Path
  if ($resolved -ne $run -or (Split-Path -Parent $resolved) -ne $tempRoot -or (Split-Path -Leaf $resolved) -notmatch '^huhu-t161-[0-9a-f]{8}$' -or ((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'Unexpected snapshot cleanup target'
  }
  Unlink-Modules $resolved
  if (Get-ChildItem -LiteralPath $resolved -Recurse -Force -Attributes ReparsePoint | Select-Object -First 1) { throw 'Unexpected dependency junction' }
  Add-Type -AssemblyName Microsoft.VisualBasic
  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($resolved, [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)
  if (Test-Path -LiteralPath $resolved) { throw 'Snapshot remains at its original path' }
  'snapshot_removed=True method=Windows_Recycle_Bin' | Add-Content -LiteralPath (Join-Path $evidence 'cleanup.log')
}
exit $exitCode
