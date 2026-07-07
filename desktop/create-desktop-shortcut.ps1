$ErrorActionPreference = "Stop"

$desktop = [Environment]::GetFolderPath("Desktop")
$windowsDir = $env:WINDIR
if (-not $windowsDir) { $windowsDir = $env:SystemRoot }
if (-not $windowsDir) { $windowsDir = "C:\Windows" }
$target = Join-Path $PSScriptRoot "NiuWidgetLauncher.exe"
if (-not (Test-Path -LiteralPath $target)) {
    $target = Join-Path $windowsDir "System32\wscript.exe"
}
$vbs = Join-Path $PSScriptRoot "launch-widget.vbs"
$shortcutPath = Join-Path $desktop "Niu MT Widget.lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $target
if ($target -like "*wscript.exe") {
    $shortcut.Arguments = "`"$vbs`""
} else {
    $shortcut.Arguments = ""
}
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.WindowStyle = 7
$shortcut.Description = "Niu MT desktop widget"
if ($target -like "*.exe" -and $target -notlike "*wscript.exe") {
    $shortcut.IconLocation = "$target,0"
} else {
    $shortcut.IconLocation = "$windowsDir\System32\imageres.dll,102"
}
$shortcut.Save()

Write-Host "Created: $shortcutPath"
