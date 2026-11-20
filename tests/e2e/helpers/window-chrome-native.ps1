param(
  [Parameter(Mandatory)] [long] $Handle,
  [Parameter(Mandatory)] [string] $Sample,
  [Parameter(Mandatory)] [string] $Screenshot
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NativeCaption {
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr handle);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr handle, ref Point point);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle, out Rect rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr handle, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr handle, uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
}
'@
$hwnd = [IntPtr]::new($Handle)
$context = [NativeCaption]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
try {
  $origin = [NativeCaption+Point]::new()
  if (![NativeCaption]::ClientToScreen($hwnd, [ref]$origin)) { throw 'Cannot read the Electron client origin' }
  $s = [NativeCaption]::GetDpiForWindow($hwnd) / 96.0
  $points = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Sample)) | ConvertFrom-Json
  $hits = @{}
  foreach ($item in $points) {
    $x = $origin.X + [int]($item.x * $s)
    $y = $origin.Y + [int]($item.y * $s)
    $packed = [IntPtr]::new([long]((($y -band 65535L) -shl 16) -bor ($x -band 65535L)))
    $value = [IntPtr]::Zero
    if ([NativeCaption]::SendMessageTimeout($hwnd, 0x84, [IntPtr]::Zero, $packed, 2, 1000, [ref]$value) -eq [IntPtr]::Zero) { throw 'Window did not answer WM_NCHITTEST' }
    $hits[$item.name] = $value.ToInt32()
  }
  $bounds = [NativeCaption+Rect]::new()
  if (![NativeCaption]::GetWindowRect($hwnd, [ref]$bounds)) { throw 'Cannot read the Electron window bounds' }
  $bitmap = [Drawing.Bitmap]::new($bounds.Right - $bounds.Left, $bounds.Bottom - $bounds.Top)
  try {
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $dc = $graphics.GetHdc()
    try { $captured = [NativeCaption]::PrintWindow($hwnd, $dc, 2) }
    finally { $graphics.ReleaseHdc($dc); $graphics.Dispose() }
    if ($captured) { $bitmap.Save($Screenshot, [Drawing.Imaging.ImageFormat]::Png) }
  } finally { $bitmap.Dispose() }
  @{ dpi = [NativeCaption]::GetDpiForWindow($hwnd); hits = $hits; captured = $captured } | ConvertTo-Json -Compress
} finally {
  if ($context -ne [IntPtr]::Zero) { [void][NativeCaption]::SetThreadDpiAwarenessContext($context) }
}
