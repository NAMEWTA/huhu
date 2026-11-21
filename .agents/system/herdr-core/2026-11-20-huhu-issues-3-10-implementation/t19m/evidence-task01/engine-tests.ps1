$ErrorActionPreference='Stop'
$commit='40822efd63d80cdc1bcba1d0f9c7d1219aa5bbd1'
$fixtureRoot=Join-Path $PSScriptRoot 'fixed2'
if(!(Test-Path $fixtureRoot)){New-Item -ItemType Directory -Path $fixtureRoot | Out-Null}
$archive=Join-Path $PSScriptRoot 'source.zip'
git archive --format=zip -o $archive $commit
if($LASTEXITCODE){throw 'archive failed'}
python -m zipfile -e $archive $fixtureRoot
if($LASTEXITCODE){throw 'unpack failed'}
$sourceRoot=(Resolve-Path "$env:TEMP/huhu-t187-task13-3785ee2d/candidate").Path
function Copy-Dependencies($source,$dest){
  New-Item -ItemType Directory -Path $dest -Force | Out-Null
  foreach($entry in (Get-ChildItem $source -Directory -Force)){
    if($entry.Name.StartsWith('.')){continue}
    $to=Join-Path $dest $entry.Name
    if($entry.LinkType -and (Test-Path $to)){continue}
    if($entry.LinkType -eq 'Junction' -or $entry.LinkType -eq 'SymbolicLink'){
      $target=$entry.Target[0]
      if($target.StartsWith($sourceRoot,[StringComparison]::OrdinalIgnoreCase)){ $target=$fixtureRoot + $target.Substring($sourceRoot.Length) }
      New-Item -ItemType Junction -Path $to -Target $target | Out-Null
    }elseif($entry.Name.StartsWith('@')){Copy-Dependencies $entry.FullName $to}
  }
}
$locations=@('.') + @(foreach($family in 'plugins','packages','apps','tests','vendor'){Get-ChildItem (Join-Path $sourceRoot $family) -Directory | ForEach-Object {"$family/$($_.Name)"}})
foreach($location in $locations){$from=Join-Path $sourceRoot "$location/node_modules"; if(Test-Path $from){Copy-Dependencies $from (Join-Path $fixtureRoot "$location/node_modules")}}
Set-Location $fixtureRoot
$env:NO_COLOR='1'
$OutputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=$OutputEncoding
$ErrorActionPreference='Continue'
& node node_modules/vitest/vitest.mjs run --no-cache --pool forks --maxWorkers=1 --minWorkers=1 --reporter=verbose plugins/tasks/test/persistence-http.test.ts plugins/automations/test/scan.test.ts plugins/automations/test/task-scan-occurrences.test.ts -t '原生回答先落盘|最早派遣按显式时区保存|台北明早|停用期间不补扫' *> "$PSScriptRoot/engine-tests.log"
exit $LASTEXITCODE
