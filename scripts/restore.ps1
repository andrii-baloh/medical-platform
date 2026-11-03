param(
  [Parameter(Mandatory = $true)][string]$Dump,
  [string]$Project = 'medicare-test',
  [string]$EnvFile = '.env.test',
  [switch]$Confirm
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not $Confirm) {
  Write-Error "Refusing to restore without -Confirm. Target project: $Project. This is destructive."
  exit 2
}
if ($Project -match 'prod') {
  Write-Error 'Refusing to restore into a project whose name contains "prod".'
  exit 2
}
if (-not (Test-Path $Dump)) {
  Write-Error "Dump file not found: $Dump"
  exit 2
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error 'BLOCKED: Docker CLI is not installed or not on PATH.'
  exit 2
}

Write-Host "Restoring $Dump into project $Project (database medicare_test)."
docker compose -p $Project --env-file $EnvFile exec -T postgres pg_restore -U medicare_test -d medicare_test --clean --if-exists --no-owner < $Dump
if ($LASTEXITCODE -ne 0) { Write-Error 'pg_restore failed'; exit $LASTEXITCODE }

Write-Host 'Restore finished. Verify data integrity and application health before declaring a successful restore test.'
