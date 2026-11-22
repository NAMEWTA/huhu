param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference='Stop'
$repo=(Get-Location).Path
$src=(Resolve-Path 'temp/issue-worktrees/integration').Path
$imap=(Resolve-Path 'temp/issue-baseline/mail-protocol/node_modules/imapflow').Path
$workspace=@{'@huhu/contracts'='packages/contracts';'@huhu/cordis'='vendor/cordis';'@huhu/cosmokit'='vendor/cosmokit';'@huhu/kernel'='packages/kernel';'@huhu/vault'='packages/vault'}
function Link($to,$from) {
 if(!(Test-Path -LiteralPath $from -PathType Container)){throw "Missing test dependency: $from"}
 New-Item -ItemType Directory -Force -Path (Split-Path -Parent $to) | Out-Null
 New-Item -ItemType Junction -Path $to -Target $from | Out-Null
}
$layout=@()
foreach ($case in @(@('parent','be12ca89984b760face1778499db222f98caab40'),@('candidate','6d9fde656fdc108b5d355a378ab295f3d9418b26'))) {
 $dir=Join-Path $Root $case[0]
 $sha=$case[1]
 $tar=Join-Path $Root ($case[0]+'.tar')
 New-Item -ItemType Directory -Path $dir | Out-Null
 git archive --format=tar "--output=$tar" $sha -- package.json pnpm-lock.yaml vitest.workspace.ts tsconfig.base.json packages/contracts packages/kernel packages/vault vendor/cordis vendor/cosmokit plugins/mail tests/perf/vitest.config.ts
 if($LASTEXITCODE){throw "git archive $sha failed"}
 tar.exe -xf $tar -C $dir
 if($LASTEXITCODE){throw "Archive extraction failed"}
 Remove-Item -LiteralPath $tar
 foreach($dep in 'vitest','typescript','@types/node'){ Link (Join-Path $dir "node_modules/$dep") (Join-Path $src "node_modules/$dep") }
 foreach($relative in @($workspace.Values)+'plugins/mail'){
  $manifest=Get-Content -Raw -LiteralPath (Join-Path $dir "$relative/package.json") | ConvertFrom-Json
  foreach($group in 'dependencies','devDependencies'){
   foreach($dep in $manifest.$group.PSObject.Properties.Name){
    if($workspace.ContainsKey($dep)){$target=Join-Path $dir $workspace[$dep]}
    elseif($dep -eq 'imapflow'){$target=$imap}
    elseif($relative -eq 'plugins/mail'){$target=Join-Path $src 'packages/kernel/node_modules/zod'}
    else{$target=Join-Path $src "$relative/node_modules/$dep"}
    Link (Join-Path $dir "$relative/node_modules/$dep") $target
   }
  }
 }
 $layout+=[pscustomobject]@{name=$case[0];sha=$sha;path=$dir}
}
$layout | ConvertTo-Json