Add-Type -AssemblyName System.Windows.Forms
$task = Get-Content -Raw 'C:\Users\orest\Desktop\PAPA\MedicalPlatform\ZAI_SITE_TASK_01_SHORT.md'
Set-Clipboard -Value $task
$ws = New-Object -ComObject WScript.Shell
Start-Sleep -Milliseconds 300
[System.Windows.Forms.SendKeys]::SendWait('{END}')
Start-Sleep -Milliseconds 500
[System.Windows.Forms.SendKeys]::SendWait('^v')
Start-Sleep -Milliseconds 700
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
