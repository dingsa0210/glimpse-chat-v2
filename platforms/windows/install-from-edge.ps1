$ErrorActionPreference = "Stop"
$siteUrl = "https://glimpsechat.com"
$edgeCandidates = @(
  "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
)
$edge = $edgeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if ($edge) { Start-Process -FilePath $edge -ArgumentList $siteUrl } else { Start-Process $siteUrl }

Write-Host "Glimpse Chat is open in Microsoft Edge."
Write-Host "Click the Install Glimpse Chat icon at the right side of the address bar, then click Install."
Write-Host "The installed app will appear in the Windows Start menu and can be pinned to the taskbar."
