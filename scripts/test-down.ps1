param([switch]$KeepVolumes)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error 'BLOCKED: Docker CLI is not installed or not on PATH.'
  exit 2
}
if (-not (Test-Path '.env.test')) {
  Write-Error 'No .env.test found. Refusing to guess which project to tear down.'
  exit 2
}

if ($KeepVolumes) {
  docker compose -p medicare-test --env-file .env.test down
} else {
  # Test contour only: volumes contain throwaway test data.
  docker compose -p medicare-test --env-file .env.test down -v
}
exit $LASTEXITCODE
