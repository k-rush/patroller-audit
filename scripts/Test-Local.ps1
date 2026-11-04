[CmdletBinding()]
param([int]$Port = 18080)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$baseUrl = "http://127.0.0.1:$Port"
foreach ($path in @('/health', '/api/health')) {
  $response = Invoke-WebRequest "$baseUrl$path" -TimeoutSec 15
  if ($response.StatusCode -ne 200) { throw "$path is unhealthy." }
}
$page = Invoke-WebRequest $baseUrl -TimeoutSec 15
if ($page.StatusCode -ne 200 -or $page.Content -notmatch '<title>PatrolOps</title>') {
  throw 'Packaged application shell was not served.'
}
$scriptPath = [regex]::Match($page.Content, 'src="(/assets/[^"]+\.js)"').Groups[1].Value
if (-not $scriptPath) { throw 'Packaged SPA entry point was not found.' }
$script = Invoke-WebRequest "$baseUrl$scriptPath" -TimeoutSec 15
if ($script.StatusCode -ne 200 -or $script.Content -notmatch 'PatrolOps') {
  throw 'Packaged SPA JavaScript was not served anonymously.'
}
$unknown = Invoke-WebRequest "$baseUrl/api/not-a-feature" -SkipHttpErrorCheck -TimeoutSec 15
if ($unknown.StatusCode -ne 404) { throw 'Unknown API route must not return the SPA.' }
$authAddress = docker compose port firebase-auth-emulator 9099
if ($LASTEXITCODE -ne 0 -or -not $authAddress) { throw 'Firebase Auth emulator port is unavailable.' }
$authUrl = "http://$authAddress/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-emulator-key"
$authReady = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  try {
    $response = Invoke-WebRequest $authUrl -Method Post -ContentType 'application/json' -TimeoutSec 5 -SkipHttpErrorCheck `
      -Body '{"email":"nobody@example.invalid","password":"not-a-real-password","returnSecureToken":true}'
    if ($response.StatusCode -eq 400 -and ($response.Content | ConvertFrom-Json).error.message -match 'EMAIL_NOT_FOUND|INVALID_LOGIN_CREDENTIALS') {
      $authReady = $true
      break
    }
  } catch { }
  Start-Sleep -Seconds 1
}
if (-not $authReady) { throw 'Firebase Auth emulator did not respond to an authentication request.' }
Write-Host 'Packaged SPA, liveness, Cosmos readiness, and Firebase Auth connectivity passed.'
