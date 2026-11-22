param([string]$Evidence)
$failed = $false
foreach ($mode in 'baseline','feature','raw','plan') {
  & powershell.exe -NoProfile -File (Join-Path $Evidence 'verify.ps1') $Evidence $mode
  $status = $LASTEXITCODE
  Write-Output "Pinned provider probe $mode exited $status"
  if ($status -ne 0) { $failed = $true }
}
if ($failed) { exit 1 }
exit 0
