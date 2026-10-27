$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'kmbhelp'
$envFile = Join-Path $root 'dev.env'
$backupDir = Join-Path $root 'backups'
if (-not (Test-Path -LiteralPath $envFile)) {
  Write-Error 'dev.env fehlt.'
  exit 1
}
$line = Get-Content -LiteralPath $envFile | Where-Object { $_ -like 'DATABASE_URL=*' } | Select-Object -First 1
if (-not $line) {
  Write-Error 'DATABASE_URL fehlt.'
  exit 1
}
$raw = $line.Substring('DATABASE_URL='.Length).Trim().Trim('"').Trim("'")
$uri = [Uri]$raw
$userInfo = $uri.UserInfo
$split = $userInfo.IndexOf(':')
if ($split -lt 1) {
  Write-Error 'DATABASE_URL ohne Benutzer.'
  exit 1
}
$user = [Uri]::UnescapeDataString($userInfo.Substring(0, $split))
$env:PGPASSWORD = [Uri]::UnescapeDataString($userInfo.Substring($split + 1))
$database = $uri.AbsolutePath.Trim('/')
if (-not $database) {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Write-Error 'DATABASE_URL ohne Datenbank.'
  exit 1
}
$dump = @(
  'C:\Program Files\PostgreSQL\17\bin\pg_dump.exe',
  'C:\Program Files\PostgreSQL\16\bin\pg_dump.exe'
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $dump) {
  $found = Get-Command pg_dump -ErrorAction SilentlyContinue
  if ($found) { $dump = $found.Source }
}
if (-not $dump) {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Write-Error 'pg_dump fehlt.'
  exit 1
}
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HH'
$target = Join-Path $backupDir "kmbhelp-$stamp.backup"
& $dump -h $uri.Host -p $uri.Port -U $user -d $database --format=custom --file=$target --no-password
$code = $LASTEXITCODE
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
if ($code -ne 0) {
  Write-Error "pg_dump endete mit $code."
  exit $code
}
Get-ChildItem -LiteralPath $backupDir -Filter 'kmbhelp-*.backup' |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } |
  Remove-Item -Force
Write-Output "backup ok $stamp"
