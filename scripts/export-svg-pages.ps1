param(
  [string]$BaseUrl = 'https://gyeongbin-38.github.io/mateon/',
  [string]$Session = 'mateon-svg'
)
# Compatibility entry point. The old approximate serializer is deprecated.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$previousSource = $env:MATEON_SOURCE_URL
Push-Location $repo
try {
  $env:MATEON_SOURCE_URL = $BaseUrl.TrimEnd('/') + '/'
  & npm run export:svg
  if ($LASTEXITCODE -ne 0) { throw 'SVG export failed' }
} finally {
  $env:MATEON_SOURCE_URL = $previousSource
  Pop-Location
}
