$ErrorActionPreference = "Stop"
$siteUrl = [uri]::EscapeDataString("https://glimpsechat.com")
Start-Process "https://www.pwabuilder.com/?site=$siteUrl"

Write-Host "PWABuilder is open. Use the Package ID, Publisher display name and Publisher ID from Partner Center."
Write-Host "Do not commit real store identity or signing material to a public repository."
