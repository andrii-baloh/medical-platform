$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Run([string]$Label, [scriptblock]$Command) {
  Write-Host "== $Label =="
  & $Command
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error 'Node.js is required.'
  exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error 'npm is required.'
  exit 1
}

Run 'Infrastructure static validation' { node scripts/check-infra.cjs }
Run 'Next runtime config syntax' { node --check infra/web/next.config.mjs }
Run 'Infrastructure checker syntax' { node --check scripts/check-infra.cjs }
Run 'TypeScript typecheck' { npm.cmd run typecheck }
Run 'Production build' { npm.cmd run build }

$parseErrors = @()
Get-ChildItem scripts -Filter '*.ps1' | ForEach-Object {
  $tokens = $null
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$tokens, [ref]$errors) | Out-Null
  if ($errors.Count) { $parseErrors += $errors }
}
if ($parseErrors.Count) {
  $parseErrors | Format-List
  exit 1
}
Write-Host 'PowerShell syntax: PASS'

if (Get-Command docker -ErrorAction SilentlyContinue) {
  $envFile = if (Test-Path '.env') { '.env' } else { '.env.example' }
  Run 'Docker Compose config' { docker compose --env-file $envFile config --quiet }
  docker info *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'BLOCKED: Docker CLI is present, but Docker Desktop engine is unavailable. Runtime/E2E was not executed.'
    exit 2
  }
  Write-Host 'Docker engine is available. Static checks passed; run scripts/dev-up.ps1 for runtime validation.'
} else {
  Write-Host 'BLOCKED: Docker CLI is unavailable. Runtime/E2E was not executed.'
  exit 2
}
