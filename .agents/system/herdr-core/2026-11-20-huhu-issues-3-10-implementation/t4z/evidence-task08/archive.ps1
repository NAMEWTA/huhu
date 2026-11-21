param([string]$Base, [string]$Name, [string[]]$Overlay)
$ErrorActionPreference = 'Stop'
$source = (Get-Location).Path
$integration = (Resolve-Path 'temp/issue-worktrees/integration').Path
$root = New-Item -ItemType Directory -Path (Join-Path ([IO.Path]::GetTempPath()) ('h80-' + $Name))
$dest = $root.FullName
$tar = Join-Path $dest 'src.zip'
git archive --format=zip -o $tar $Base
if ($LASTEXITCODE) { throw 'git archive failed' }
python -m zipfile -e $tar $dest
if ($LASTEXITCODE) { throw 'tar failed' }
Remove-Item -LiteralPath $tar
$integrated = git -C $integration rev-parse HEAD
$lockDiff = @(git diff --unified=2 $Base $integrated -- pnpm-lock.yaml)
$changed = @($lockDiff | Where-Object { $_ -match '^[+-][^+-]' })
if ($changed.Count -and ($changed -join '|' -ne '+      tsx:|+        specifier: ^4.23.15|+        version: 4.23.15')) { throw 'relevant dependency locks differ' }
function Link-Modules($from, $to) {
  if (!(Test-Path -LiteralPath $from)) { return }
  New-Item -ItemType Directory -Path $to -Force | Out-Null
  foreach ($entry in (Get-ChildItem -LiteralPath $from -Force -Directory)) {
    if ($entry.Name -in '.bin','.pnpm','.vite','.vite-temp') { continue }
    if ($entry.Name.StartsWith('@')) {
      Link-Modules $entry.FullName (Join-Path $to $entry.Name)
      continue
    }
    $target = $entry.FullName
    if ($entry.Target -and ([string]$entry.Target[0]).StartsWith($integration + '\') -and !([string]$entry.Target[0]).StartsWith($integration + '\node_modules\')) {
      $local = Join-Path $dest ([string]$entry.Target[0]).Substring($integration.Length + 1)
      if (Test-Path -LiteralPath (Join-Path $local 'package.json')) { $target = $local }
    }
    New-Item -ItemType Junction -Path (Join-Path $to $entry.Name) -Target $target | Out-Null
  }
}
Link-Modules (Join-Path $integration 'node_modules') (Join-Path $dest 'node_modules')
foreach ($group in 'packages','plugins','apps','vendor','tests') {
  $sourceGroup = Join-Path $dest $group
  foreach ($project in (Get-ChildItem -LiteralPath $sourceGroup -Directory)) {
    Link-Modules (Join-Path $integration "$group/$($project.Name)/node_modules") (Join-Path $project.FullName 'node_modules')
  }
}
foreach ($file in $Overlay) {
  $out = Join-Path $dest $file
  New-Item -ItemType Directory -Path (Split-Path -Parent $out) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $source $file) -Destination $out
}
Write-Output $dest

