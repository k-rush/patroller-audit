[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Email,
  [Parameter(Mandatory)][securestring]$Password,
  [string]$BaseUrl = 'http://127.0.0.1:28080'
)

$ErrorActionPreference = 'Stop'
$origin = [uri]$BaseUrl
if ($origin.Scheme -ne 'http' -or $origin.Host -notin @('localhost', '127.0.0.1') -or
    $origin.AbsolutePath -ne '/' -or $origin.UserInfo -or $origin.Query -or $origin.Fragment) {
  throw 'Only an explicit loopback development app is allowed.'
}
$config = Invoke-RestMethod "$($BaseUrl.TrimEnd('/'))/api/config"
$emulator = [uri]$config.emulatorUrl
if ($config.projectId -ne 'demo-patroller-audit-local' -or $emulator.Scheme -ne 'http' -or
    $emulator.Host -notin @('localhost', '127.0.0.1') -or $emulator.AbsolutePath -ne '/' -or
    $emulator.UserInfo -or $emulator.Query -or $emulator.Fragment) {
  throw 'This command can provision only the local Firebase emulator.'
}
$authUrl = $emulator.AbsoluteUri.TrimEnd('/')
$plainPassword = [System.Net.NetworkCredential]::new('', $Password).Password
try {
  $account = Invoke-RestMethod "$authUrl/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local-emulator" `
    -Method Post -ContentType 'application/json' `
    -Body (@{ email = $Email; password = $plainPassword; returnSecureToken = $false } | ConvertTo-Json)
  $null = Invoke-RestMethod "$authUrl/identitytoolkit.googleapis.com/v1/projects/$($config.projectId)/accounts:update" `
    -Method Post -ContentType 'application/json' -Headers @{ Authorization = 'Bearer owner' } `
    -Body (@{ localId = $account.localId; customAttributes = '{"dispatcher":true,"resortId":"summit-west"}' } | ConvertTo-Json)
  Write-Host "Local Summit West dispatcher provisioned. Sign in at $BaseUrl."
} finally {
  $plainPassword = $null
}
