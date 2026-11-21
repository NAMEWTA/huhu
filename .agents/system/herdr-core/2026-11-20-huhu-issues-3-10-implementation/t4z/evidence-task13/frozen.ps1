param(
  [string]$Ref = '6b11b63cb6cfae8b2a2f0effe5d64657a203496f',
  [ValidatePattern('^[a-z0-9-]+$')][string]$Case = 'independent',
  [string[]]$Overlay = @(),
  [string]$Patch,
  [string[]]$Tests = @('plugins/safe/test/safe.test.ts', 'plugins/safe/test/safe.engine.test.ts', 'apps/engine/test/engine.test.ts', 'apps/engine/test/module-credential-host.test.ts', '-t', '同一 Safe 并发初始化|仅剩损坏的当前格式清单|停用时阻止仍在派生|第二个文件写失败|锁定发生于改密暂存|仅凭旧格式 keyring|密码太短拒绝|ACC-SF-02|锁定状态下操作|keyring 损坏|无操作超时|非法的自动锁定|离开遵循设置|ACC-SF-03|桌面 HTTP 入口设置|真实 Engine (disable|shutdown)|ACC-SY-08：导出受管|Windows 模块凭据与 Safe'),
  [switch]$Typecheck
)
$ErrorActionPreference = 'Stop'
$checkout = 'D:/Document/code/huhu'
$integration = (Resolve-Path 'D:/Document/code/huhu/temp/issue-worktrees/integration').Path
$tempRoot = (Resolve-Path ([IO.Path]::GetTempPath())).Path.TrimEnd('\')
$snapshot = (New-Item -ItemType Directory -Path (Join-Path $tempRoot ('huhu-t4z-13-' + $Case + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)))).FullName
$log = Join-Path $PSScriptRoot ($Case + '.log')
$utf8 = New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$writer = New-Object IO.StreamWriter($log, $false, $utf8)
$writer.AutoFlush = $true
function Record($line) { Write-Host $line; $writer.WriteLine($line) }
function Link-Modules($from, $to) {
  if (!(Test-Path -LiteralPath $from)) { return }
  New-Item -ItemType Directory -Path $to -Force | Out-Null
  foreach ($entry in (Get-ChildItem -LiteralPath $from -Force -Directory)) {
    if ($entry.Name.StartsWith('.')) { continue }
    if ($entry.Name.StartsWith('@')) {
      Link-Modules $entry.FullName (Join-Path $to $entry.Name)
      continue
    }
    $target = $entry.FullName
    $linked = @($entry.Target)[0]
    if ($linked -and $linked.StartsWith($integration + '\') -and !$linked.StartsWith($integration + '\node_modules\')) {
      $local = Join-Path $snapshot $linked.Substring($integration.Length + 1)
      if (Test-Path -LiteralPath (Join-Path $local 'package.json')) { $target = $local }
    }
    New-Item -ItemType Junction -Path (Join-Path $to $entry.Name) -Target $target | Out-Null
  }
}
$code = 1
try {
  $sha = git -C $checkout rev-parse $Ref
  if ($LASTEXITCODE) { throw 'git rev-parse failed' }
  Record "git=$sha overlay=$($Overlay -join ',') patch=$Patch node=$(node -v) snapshot=$snapshot"
  Record "dependencies=$(git -C $integration rev-parse HEAD) lock_diff=$(git -C $checkout diff --shortstat $sha $(git -C $integration rev-parse HEAD) -- pnpm-lock.yaml)"
  $zip = Join-Path $snapshot 'src.zip'
  git -C $checkout archive --format=zip -o $zip $sha
  if ($LASTEXITCODE) { throw 'git archive failed' }
  python -m zipfile -e $zip $snapshot
  if ($LASTEXITCODE) { throw 'archive extraction failed' }
  Remove-Item -LiteralPath $zip
  if ($Patch) {
    $patchPath = (Resolve-Path -LiteralPath $Patch).Path
    git -C $snapshot apply --check $patchPath
    if ($LASTEXITCODE) { throw 'patch does not apply to frozen source' }
    git -C $snapshot apply $patchPath
    if ($LASTEXITCODE) { throw 'patch overlay failed' }
    Record "patch_sha256=$((Get-FileHash -LiteralPath $patchPath).Hash.ToLowerInvariant())"
  }
  Link-Modules (Join-Path $integration 'node_modules') (Join-Path $snapshot 'node_modules')
  foreach ($group in 'packages','plugins','apps','vendor','tests') {
    foreach ($project in (Get-ChildItem -LiteralPath (Join-Path $snapshot $group) -Directory -ErrorAction SilentlyContinue)) {
      Link-Modules (Join-Path $integration "$group/$($project.Name)/node_modules") (Join-Path $project.FullName 'node_modules')
    }
  }
  foreach ($file in $Overlay) {
    Copy-Item -LiteralPath (Join-Path $checkout $file) -Destination (Join-Path $snapshot $file)
  }

  $env:NO_COLOR = '1'
  Push-Location $snapshot
  try {
    if ($Tests.Length) {
      $testArgs = @('node_modules/vitest/vitest.mjs','run','--maxWorkers=1','--minWorkers=1','--reporter=verbose') + $Tests
      Record "node $($testArgs -join ' ')"
      $ErrorActionPreference = 'Continue'
      node @testArgs 2>&1 | ForEach-Object { Record ([string]$_) }
      $code = $LASTEXITCODE
      $ErrorActionPreference = 'Stop'
      Record "vitest_exit=$code"
    } else { $code = 0 }
    if ($Typecheck) {
      $ErrorActionPreference = 'Continue'
      foreach ($project in 'vendor/cosmokit/tsconfig.json','vendor/cordis/tsconfig.json','plugins/agent-cli/tsconfig.json') {
        $tsArgs = @('node_modules/typescript/bin/tsc','-p',$project)
        if ($project.StartsWith('plugins/')) { $tsArgs += '--noEmit' }
        Record "node $($tsArgs -join ' ')"
        node @tsArgs 2>&1 | ForEach-Object { Record ([string]$_) }
        $typeExit = $LASTEXITCODE
        Record "typecheck_exit=$typeExit"
        if ($typeExit) { $code = $typeExit; break }
      }
      $ErrorActionPreference = 'Stop'
    }
  } finally { Pop-Location }
} finally {
  $resolved = (Resolve-Path -LiteralPath $snapshot).Path
  if ($resolved -ne $snapshot -or (Split-Path -Parent $resolved) -ne $tempRoot -or (Split-Path -Leaf $resolved) -notlike "huhu-t4z-13-$Case-*") { throw 'Unexpected snapshot cleanup target' }
  # Remove junctions as links so recursive cleanup never traverses the shared dependency install.
  function Unlink-Modules($directory) {
    foreach ($entry in (Get-ChildItem -LiteralPath $directory -Directory -Force)) {
      if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { [IO.Directory]::Delete($entry.FullName) }
      else { Unlink-Modules $entry.FullName }
    }
  }
  Unlink-Modules $resolved
  Remove-Item -LiteralPath $resolved -Recurse -Force
  Record "snapshot_removed=$(!(Test-Path -LiteralPath $resolved))"
  $writer.Dispose()
}
exit $code
