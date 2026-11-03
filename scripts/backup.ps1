param(
  [string]$OutDir = 'backups',
  [string]$Project = 'medicare-test',
  [string]$EnvFile = '.env.test'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error 'BLOCKED: Docker CLI is not installed or not on PATH.'
  exit 2
}
if (-not (Test-Path $EnvFile)) {
  Write-Error "Env file $EnvFile not found."
  exit 2
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$target = Join-Path $OutDir "medicare-$stamp.dump"

# Custom format keeps ownership/ACL data and allows selective restore.
docker compose -p $Project --env-file $EnvFile exec -T postgres pg_dump -U medicare_test -d medicare_test -Fc > $target
if ($LASTEXITCODE -ne 0) { Write-Error 'pg_dump failed'; exit $LASTEXITCODE }

Write-Host "Backup written: $target"
Write-Host 'Restore is NOT tested automatically. A backup without a verified restore is not a backup.'
