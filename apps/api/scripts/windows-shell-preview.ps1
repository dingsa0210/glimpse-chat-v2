param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [int]$Width = 1800,
  [int]$Height = 1400,
  [switch]$RequireDrawingGeometry
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if (-not ([System.Management.Automation.PSTypeName]'GlimpseShellPreview.Native').Type) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace GlimpseShellPreview {
  [StructLayout(LayoutKind.Sequential)]
  public struct SIZE { public int cx; public int cy; }

  [Flags]
  public enum SIIGBF : uint {
    ResizeToFit = 0x00,
    BiggerSizeOk = 0x01,
    MemoryOnly = 0x02,
    IconOnly = 0x04,
    ThumbnailOnly = 0x08,
    InCacheOnly = 0x10,
    CropToSquare = 0x20,
    WideThumbnails = 0x40,
    IconBackground = 0x80,
    ScaleUp = 0x100
  }

  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b")]
  public interface IShellItemImageFactory {
    void GetImage(SIZE size, SIIGBF flags, out IntPtr phbm);
  }

  public static class Native {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    public static extern void SHCreateItemFromParsingName(string path, IntPtr bindContext, ref Guid riid, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory factory);

    [DllImport("gdi32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool DeleteObject(IntPtr handle);

    public static IntPtr GetImage(string path, int width, int height) {
      Guid interfaceId = new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b");
      IShellItemImageFactory factory;
      SHCreateItemFromParsingName(path, IntPtr.Zero, ref interfaceId, out factory);
      try {
        IntPtr bitmap;
        // ThumbnailOnly prevents Windows from silently returning an application
        // icon when no real document thumbnail provider is available.
        factory.GetImage(new SIZE { cx = width, cy = height }, SIIGBF.ThumbnailOnly | SIIGBF.BiggerSizeOk | SIIGBF.ScaleUp, out bitmap);
        return bitmap;
      } finally {
        if (factory != null && Marshal.IsComObject(factory)) Marshal.FinalReleaseComObject(factory);
      }
    }
  }
}
'@
}

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$outputDirectory = Split-Path -Parent ([IO.Path]::GetFullPath($OutputPath))
[IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
$bitmapHandle = [IntPtr]::Zero
$bitmap = $null
$image = $null
try {
  $requestedWidth = [Math]::Max(64, [Math]::Min(4096, $Width))
  $requestedHeight = [Math]::Max(64, [Math]::Min(4096, $Height))
  $bitmapHandle = [GlimpseShellPreview.Native]::GetImage($resolvedInput, $requestedWidth, $requestedHeight)
  if ($bitmapHandle -eq [IntPtr]::Zero) { throw "The Windows preview handler returned no image." }
  $bitmap = [System.Drawing.Image]::FromHbitmap($bitmapHandle)
  $image = New-Object System.Drawing.Bitmap $bitmap.Width, $bitmap.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($image)
  try {
    $graphics.Clear([System.Drawing.Color]::White)
    $graphics.DrawImage($bitmap, 0, 0, $bitmap.Width, $bitmap.Height)
  } finally { $graphics.Dispose() }
  if ($RequireDrawingGeometry) {
    # A shell thumbnail provider can silently return a file-name card,
    # application icon or other placeholder. Sample the bitmap and require
    # visible content to span a drawing-sized region before accepting it as a
    # CAD preview.
    if ($image.Width -lt 512 -or $image.Height -lt 512) { throw "The CAD preview handler returned only a small placeholder thumbnail." }
    $stepX = [Math]::Max(1, [Math]::Floor($image.Width / 320))
    $stepY = [Math]::Max(1, [Math]::Floor($image.Height / 320))
    $sampleColumns = [Math]::Ceiling($image.Width / $stepX)
    $sampleRows = [Math]::Ceiling($image.Height / $stepY)
    $occupiedColumns = New-Object bool[] $sampleColumns
    $occupiedRows = New-Object bool[] $sampleRows
    $nonBackground = 0
    $minX = $image.Width
    $minY = $image.Height
    $maxX = -1
    $maxY = -1
    $columnIndex = 0
    for ($x = 0; $x -lt $image.Width; $x += $stepX) {
      $rowIndex = 0
      for ($y = 0; $y -lt $image.Height; $y += $stepY) {
        $pixel = $image.GetPixel($x, $y)
        $spread = [Math]::Max($pixel.R, [Math]::Max($pixel.G, $pixel.B)) - [Math]::Min($pixel.R, [Math]::Min($pixel.G, $pixel.B))
        if ($pixel.A -gt 16 -and ([Math]::Min($pixel.R, [Math]::Min($pixel.G, $pixel.B)) -lt 242 -or $spread -gt 12)) {
          $nonBackground += 1
          $occupiedColumns[$columnIndex] = $true
          $occupiedRows[$rowIndex] = $true
          $minX = [Math]::Min($minX, $x)
          $minY = [Math]::Min($minY, $y)
          $maxX = [Math]::Max($maxX, $x)
          $maxY = [Math]::Max($maxY, $y)
        }
        $rowIndex += 1
      }
      $columnIndex += 1
    }
    $sampleCount = [Math]::Max(1, $sampleColumns * $sampleRows)
    $occupiedColumnCount = @($occupiedColumns | Where-Object { $_ }).Count
    $occupiedRowCount = @($occupiedRows | Where-Object { $_ }).Count
    $contentWidthRatio = if ($maxX -ge $minX) { ($maxX - $minX + 1) / $image.Width } else { 0 }
    $contentHeightRatio = if ($maxY -ge $minY) { ($maxY - $minY + 1) / $image.Height } else { 0 }
    $inkRatio = $nonBackground / $sampleCount
    if ($inkRatio -lt 0.003 -or $contentWidthRatio -lt 0.25 -or $contentHeightRatio -lt 0.18 -or $occupiedColumnCount / $sampleColumns -lt 0.15 -or $occupiedRowCount / $sampleRows -lt 0.08) {
      throw "The CAD preview handler returned a file-name, icon or placeholder image instead of drawing geometry."
    }

    # CAXA's shell provider renders the drawing into a square thumbnail and
    # often leaves most of that bitmap blank. Showing the full square makes
    # the useful drawing occupy only a small part of the browser viewport and
    # appear much softer than the pixels returned by the provider. Preserve
    # the native pixels, but crop the blank border with a small safety margin.
    $margin = [Math]::Max(24, [Math]::Round([Math]::Max($image.Width, $image.Height) * 0.025))
    $cropLeft = [Math]::Max(0, $minX - $margin)
    $cropTop = [Math]::Max(0, $minY - $margin)
    $cropRight = [Math]::Min($image.Width - 1, $maxX + $margin)
    $cropBottom = [Math]::Min($image.Height - 1, $maxY + $margin)
    $cropWidth = $cropRight - $cropLeft + 1
    $cropHeight = $cropBottom - $cropTop + 1
    if ($cropWidth -ge 512 -and $cropHeight -ge 512 -and ($cropWidth -lt $image.Width * 0.94 -or $cropHeight -lt $image.Height * 0.94)) {
      $cropped = New-Object System.Drawing.Bitmap $cropWidth, $cropHeight, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      $croppedGraphics = [System.Drawing.Graphics]::FromImage($cropped)
      try {
        $croppedGraphics.Clear([System.Drawing.Color]::White)
        $croppedGraphics.DrawImageUnscaled($image, -$cropLeft, -$cropTop)
      } finally { $croppedGraphics.Dispose() }
      $image.Dispose()
      $image = $cropped
    }
  }
  $image.Save([IO.Path]::GetFullPath($OutputPath), [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  if ($RequireDrawingGeometry -and (Test-Path -LiteralPath $OutputPath) -and ((Get-Item -LiteralPath $OutputPath).Length -lt 10000)) { Remove-Item -LiteralPath $OutputPath -Force -ErrorAction SilentlyContinue }
  if ($image) { $image.Dispose() }
  if ($bitmap) { $bitmap.Dispose() }
  if ($bitmapHandle -ne [IntPtr]::Zero) { [GlimpseShellPreview.Native]::DeleteObject($bitmapHandle) | Out-Null }
}
