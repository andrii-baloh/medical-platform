$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error 'BLOCKED: Docker CLI is not installed or not on PATH.'
  exit 2
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Error 'BLOCKED: Docker Desktop engine is not available.'
  exit 2
}

$envFile = if (Test-Path '.env') { '.env' } else { '.env.example' }
docker compose --env-file $envFile down --remove-orphans
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'MediCare containers stopped. Named volumes were preserved.'
