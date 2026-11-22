$ErrorActionPreference = 'Stop'
$dest = (Get-Location).Path
$integration = (Resolve-Path '../integration').Path
$lockedDiff = @(git diff HEAD (git -C $integration rev-parse HEAD) -- pnpm-lock.yaml)
if ($LASTEXITCODE -ne 0 -or $lockedDiff.Count) { throw 'The committed dependency locks differ' }
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
  foreach ($project in (Get-ChildItem -LiteralPath (Join-Path $dest $group) -Directory)) {
    Link-Modules (Join-Path $integration "$group/$($project.Name)/node_modules") (Join-Path $project.FullName 'node_modules')
  }
}
foreach ($vendorName in 'cosmokit','cordis','timer') {
  New-Item -ItemType Junction -Path "$dest/vendor/$vendorName/lib" -Target "$integration/vendor/$vendorName/lib" | Out-Null
}
node --version
node node_modules/vitest/vitest.mjs --version
node node_modules/typescript/bin/tsc --version
