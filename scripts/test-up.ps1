param(
  [switch]$NoWait
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error 'BLOCKED: Docker CLI is not installed or not on PATH.'
  exit 2
}

if (-not (Test-Path '.env.test')) {
  Copy-Item '.env.test.example' '.env.test'
  Write-Host 'Created .env.test from .env.test.example (test-only values).'
}

# Separate compose project: own volumes, own network, own ports.
docker compose -p medicare-test --env-file .env.test up -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $NoWait) {
  Write-Host 'Waiting for PostgreSQL readiness...'
  for ($i = 0; $i -lt 40; $i++) {
    docker compose -p medicare-test --env-file .env.test exec -T postgres pg_isready -h 127.0.0.1 -U medicare_test -d medicare_test *> $null
    if ($LASTEXITCODE -eq 0) { Write-Host 'PostgreSQL is ready.'; break }
    Start-Sleep -Seconds 2
  }
}

docker compose -p medicare-test --env-file .env.test ps
Write-Host ''
Write-Host 'Infrastructure contour is up (project: medicare-test).'
Write-Host 'Run API/Web on the host with the API_* values from .env.test. This contour contains test data only.'
