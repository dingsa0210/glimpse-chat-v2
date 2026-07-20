param([switch]$Unsigned)

$ErrorActionPreference = "Stop"
$bubblewrapVersion = "1.24.1"

Push-Location $PSScriptRoot
try {
  $arguments = @("pnpm", "dlx", "@bubblewrap/cli@$bubblewrapVersion", "build")
  if ($Unsigned) { $arguments += "--skipSigning" }
  & corepack @arguments
  if ($LASTEXITCODE -ne 0) { throw "Bubblewrap build failed with exit code $LASTEXITCODE." }
} finally {
  Pop-Location
}
