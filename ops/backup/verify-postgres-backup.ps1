param(
    [Parameter(Mandatory = $true)]
    [string]$BackupPath
)

$ErrorActionPreference = "Stop"

$pgRestore = Get-Command pg_restore -ErrorAction SilentlyContinue
if (-not $pgRestore) {
    throw "pg_restore was not found in PATH. Install PostgreSQL client tools first."
}

$resolved = (Resolve-Path $BackupPath).Path
if ((Get-Item $resolved).Length -le 0) {
    throw "Backup file is empty: $resolved"
}

& $pgRestore.Source --list $resolved | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "pg_restore could not read the backup archive. Exit code: $LASTEXITCODE"
}

Write-Output "Backup archive is readable: $resolved"
Write-Output "This verifies archive structure only. A scheduled restore drill is still required."
