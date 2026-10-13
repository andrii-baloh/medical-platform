param(
  [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Fail([string]$Message, [int]$Code = 1) {
  Write-Error $Message
  exit $Code
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail 'BLOCKED: Docker CLI is not installed or not on PATH.' 2
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Fail 'BLOCKED: Docker Desktop engine is not available. Start/fix Docker Desktop first.' 2
}

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'Created .env from .env.example (local development values only).'
}

try {
  Resolve-DnsName host.docker.internal -ErrorAction Stop | Out-Null
} catch {
  Fail 'BLOCKED: host.docker.internal does not resolve on this Windows host.' 2
}

node scripts/check-infra.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

docker compose --env-file .env config --quiet
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$args = @('compose', '--env-file', '.env', 'up', '-d')
if (-not $NoBuild) { $args += '--build' }
& docker @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri 'http://localhost:4000/health/ready'
    if ($response.StatusCode -eq 200) { $ready = $true; break }
  } catch { }
  Start-Sleep -Seconds 2
}
if (-not $ready) {
  docker compose --env-file .env ps
  Fail 'Stack started, but API readiness did not become healthy in time.' 1
}

Write-Host 'MediCare local stack is ready.'
Write-Host 'Web:      http://localhost:3000'
Write-Host 'API:      http://localhost:4000/health/ready'
Write-Host 'Keycloak: http://localhost:8080'
Write-Host 'MinIO:    http://localhost:9001'
Write-Host 'LiveKit:  ws://localhost:7880'
