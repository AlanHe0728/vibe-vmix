$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
& (Join-Path $projectRoot 'server\powershell\serve.ps1') -PublicRoot (Split-Path $PSScriptRoot -Parent) -PackageId 'football-classic'
