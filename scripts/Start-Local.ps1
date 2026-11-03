[CmdletBinding()]
param([int]$Port = 18080)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:API_PORT = "$Port"
docker compose up --build -d
if ($LASTEXITCODE -ne 0) { throw 'Local stack startup failed.' }

for ($attempt = 0; $attempt -lt 90; $attempt++) {
  try {
    $ready = Invoke-WebRequest "http://127.0.0.1:$Port/api/health" -TimeoutSec 10
    if ($ready.StatusCode -eq 200) {
      Write-Host "PatrolNotes: http://127.0.0.1:$Port"
      return
    }
  } catch { }
  Start-Sleep -Seconds 2
}
docker compose logs --tail 50 app cosmos-emulator firebase-auth-emulator
throw 'Local stack did not become ready. No replacement storage was used.'
