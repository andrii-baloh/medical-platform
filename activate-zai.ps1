$ws = New-Object -ComObject WScript.Shell
$ok = $ws.AppActivate('Z.ai')
Start-Sleep -Milliseconds 600
Write-Output "AppActivate Z.ai: $ok"
