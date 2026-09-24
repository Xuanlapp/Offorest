param([string]$TaskName = 'Offorest Local Mockup Worker')

$ErrorActionPreference = 'Stop'
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
$startupFile = Join-Path ([Environment]::GetFolderPath('Startup')) 'Offorest Local Mockup Worker.cmd'
Remove-Item -LiteralPath $startupFile -Force -ErrorAction SilentlyContinue
Write-Host "Da go task: $TaskName"
