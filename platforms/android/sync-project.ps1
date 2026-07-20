$ErrorActionPreference = "Stop"
$bubblewrapVersion = "1.24.1"

Push-Location $PSScriptRoot
try {
  & corepack pnpm dlx "@bubblewrap/cli@$bubblewrapVersion" update --skipVersionUpgrade
  if ($LASTEXITCODE -ne 0) { throw "Bubblewrap update failed with exit code $LASTEXITCODE." }
} finally {
  Pop-Location
}
