# Registra o Radar SUltra para iniciar no logon do Windows, sem janela, sem admin.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\instalar-tarefa-windows.ps1
# Remover:  Unregister-ScheduledTask -TaskName RadarSUltra -Confirm:$false
$dir  = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
$log  = Join-Path $dir 'data\radar.log'
New-Item -ItemType Directory -Force (Join-Path $dir 'data') | Out-Null
$cmd  = "Set-Location '$dir'; if (Test-Path .env) { Get-Content .env | Where-Object { `$_ -match '^\s*[^#].*=' } | ForEach-Object { `$k,`$v = `$_ -split '=',2; [Environment]::SetEnvironmentVariable(`$k.Trim(), `$v.Trim()) } }; & '$node' src/main.ts *>> '$log'"
$action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -Command `"$cmd`""
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName 'RadarSUltra' -Action $action -Trigger $trigger -Settings $settings -Description 'Coletor e servidor do Radar SUltra' -Force | Out-Null
Start-ScheduledTask -TaskName 'RadarSUltra'
Write-Host "Radar SUltra registrado e iniciado. Abra http://localhost:8787  (log: $log)"
