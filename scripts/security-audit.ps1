$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host '=== dependency vulnerability audit (production dependencies) ==='
npm audit --omit=dev --audit-level=high
$auditExit = $LASTEXITCODE

Write-Host ''
Write-Host '=== infrastructure static validation ==='
node scripts/check-infra.cjs
$infraExit = $LASTEXITCODE

Write-Host ''
if ($auditExit -ne 0) { Write-Host "npm audit reported findings (exit $auditExit)." }
if ($infraExit -ne 0) { Write-Host "infrastructure validation failed (exit $infraExit)." }
if ($auditExit -eq 0 -and $infraExit -eq 0) { Write-Host 'security-audit: PASS' }
exit ([math]::Max($auditExit, $infraExit))
