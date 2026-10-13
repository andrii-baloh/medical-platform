param(
    [Parameter(Mandatory = $true)]
    [string]$BackupPath,

    [Parameter(Mandatory = $false)]
    [switch]$ConfirmDestructiveRestore
)

$ErrorActionPreference = "Stop"

if (-not $ConfirmDestructiveRestore) {
    throw "Restore is destructive. Re-run with -ConfirmDestructiveRestore after confirming the target database."
}

if ([string]::IsNullOrWhiteSpace($env:RESTORE_DATABASE_URL)) {
    throw "RESTORE_DATABASE_URL environment variable is required. Never default restore to DATABASE_URL."
}

$pgRestore = Get-Command pg_restore -ErrorAction SilentlyContinue
if (-not $pgRestore) {
    throw "pg_restore was not found in PATH. Install PostgreSQL client tools first."
}

$resolved = (Resolve-Path $BackupPath).Path
if ((Get-Item $resolved).Length -le 0) {
    throw "Backup file is empty: $resolved"
}

Write-Output "Restoring archive: $resolved"
Write-Output "Target is taken only from RESTORE_DATABASE_URL. Credentials are not printed."

& $pgRestore.Source `
    --dbname=$env:RESTORE_DATABASE_URL `
    --clean `
    --if-exists `
    --no-owner `
    --no-privileges `
    --exit-on-error `
    $resolved

if ($LASTEXITCODE -ne 0) {
    throw "pg_restore failed with exit code $LASTEXITCODE."
}

Write-Output "Restore completed. Run application migrations and readiness checks before using the target."
