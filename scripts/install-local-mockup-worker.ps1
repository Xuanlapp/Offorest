param(
  [string]$ProjectPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$TaskName = 'Offorest Local Mockup Worker'
)

$ErrorActionPreference = 'Stop'
$project = (Resolve-Path $ProjectPath).Path
$electron = Join-Path $project 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path -LiteralPath $electron)) {
  throw "Khong tim thay Electron: $electron. Hay chay npm install truoc."
}

$action = New-ScheduledTaskAction -Execute $electron -Argument "`"$project`" --local-mockup-worker" -WorkingDirectory $project
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1)
try {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'Offorest PSD mockup queue worker' -Force | Out-Null
} catch {
  $startupDirectory = [Environment]::GetFolderPath('Startup')
  $startupFile = Join-Path $startupDirectory 'Offorest Local Mockup Worker.cmd'
  $startupContent = "@echo off`r`nstart `"`" /min `"$electron`" `"$project`" --local-mockup-worker`r`n"
  Set-Content -LiteralPath $startupFile -Value $startupContent -Encoding ascii
  Start-Process -FilePath $electron -ArgumentList "`"$project`" --local-mockup-worker" -WorkingDirectory $project -WindowStyle Hidden
  Write-Host "Khong du quyen tao Scheduled Task. Da cai worker vao Startup cua tai khoan hien tai: $startupFile"
  return
}
Start-ScheduledTask -TaskName $TaskName
Write-Host "Da cai va khoi dong: $TaskName"
