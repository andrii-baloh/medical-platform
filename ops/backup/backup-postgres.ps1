param(
    [Parameter(Mandatory = $false)]
    [string]$OutputDirectory = ".\\backups"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
    throw "DATABASE_URL environment variable is required."
}

$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
    throw "pg_dump was not found in PATH. Install PostgreSQL client tools first."
}

$resolvedDir = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $resolvedDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $resolvedDir "medicare-$stamp.dump"

& $pgDump.Source `
    --dbname=$env:DATABASE_URL `
    --format=custom `
    --no-owner `
    --no-privileges `
    --file=$backupPath

if ($LASTEXITCODE -ne 0) {
    throw "pg_dump failed with exit code $LASTEXITCODE."
}

$size = (Get-Item $backupPath).Length
if ($size -le 0) {
    throw "Backup file is empty: $backupPath"
}

Write-Output "Backup created: $backupPath"
Write-Output "Bytes: $size"
Write-Output "Run verify-postgres-backup.ps1 before treating this backup as usable."
