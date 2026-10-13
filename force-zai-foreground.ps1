Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Fg {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
"@
$HWND_TOPMOST = [IntPtr](-1)
$HWND_NOTOPMOST = [IntPtr](-2)
$SW_RESTORE = 9
$SWP_NOMOVE = 0x0002
$SWP_NOSIZE = 0x0001
$p = Get-Process chrome | Where-Object { $_.MainWindowTitle -like '*Z.ai*' } | Select-Object -First 1
if ($p) {
  [Win32Fg]::ShowWindow($p.MainWindowHandle, $SW_RESTORE) | Out-Null
  [Win32Fg]::SetWindowPos($p.MainWindowHandle, $HWND_TOPMOST, 0,0,0,0, $SWP_NOMOVE -bor $SWP_NOSIZE) | Out-Null
  Start-Sleep -Milliseconds 300
  [Win32Fg]::BringWindowToTop($p.MainWindowHandle) | Out-Null
  [Win32Fg]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
  Start-Sleep -Milliseconds 300
  [Win32Fg]::SetWindowPos($p.MainWindowHandle, $HWND_NOTOPMOST, 0,0,0,0, $SWP_NOMOVE -bor $SWP_NOSIZE) | Out-Null
  Write-Output "Forced $($p.Id): $($p.MainWindowTitle)"
} else { Write-Output 'No Z.ai window found' }
