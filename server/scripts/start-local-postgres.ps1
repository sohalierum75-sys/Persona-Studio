$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot)
$localDb = Join-Path $root '.local-postgres'
$pgCtl = Join-Path $localDb 'pgsql\bin\pg_ctl.exe'
$data = Join-Path $localDb 'data'
if (!(Test-Path $pgCtl) -or !(Test-Path (Join-Path $data 'PG_VERSION'))) {
    throw 'Local PostgreSQL has not been initialized in .local-postgres.'
}
# A process started outside a sandbox may be invisible to pg_ctl status.
# Check the listening server before attempting to launch another instance.
& (Join-Path $localDb 'pgsql\bin\pg_isready.exe') -h 127.0.0.1 -p 5432 -U persona -d persona_studio
if ($LASTEXITCODE -eq 0) { exit 0 }
& $pgCtl start -D $data -l (Join-Path $localDb 'postgres.log') -w
if ($LASTEXITCODE -ne 0) { throw 'Could not start local PostgreSQL.' }
