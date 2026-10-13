Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
$p = Get-Process chrome | Where-Object { $_.MainWindowTitle -like '*Z.ai*' } | Select-Object -First 1
if ($p) {
  [Win32]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
  Start-Sleep -Milliseconds 200
  [Win32]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
  Write-Output "Activated $($p.Id): $($p.MainWindowTitle)"
} else {
  Write-Output 'No Z.ai Chrome window found'
}
