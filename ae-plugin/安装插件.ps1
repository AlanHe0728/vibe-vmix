param([switch]$EnableUnsignedExtensions)
$ErrorActionPreference = 'Stop'
$taskExtensionRoot = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$taskPluginTarget = Join-Path $taskExtensionRoot 'com.broadcast.workspace.livebridge'
if (Test-Path -LiteralPath $taskPluginTarget) { throw "插件文件夹已存在，请先备份并手动移走旧版：$taskPluginTarget" }
New-Item -ItemType Directory -Path $taskExtensionRoot -Force | Out-Null
Copy-Item -LiteralPath $PSScriptRoot -Destination $taskPluginTarget -Recurse
if ($EnableUnsignedExtensions) {
  foreach ($taskCepVersion in 9,10,11,12) {
    $taskRegistryPath = "HKCU:\Software\Adobe\CSXS.$taskCepVersion"
    New-Item -Path $taskRegistryPath -Force | Out-Null
    New-ItemProperty -Path $taskRegistryPath -Name 'PlayerDebugMode' -PropertyType String -Value '1' -Force | Out-Null
  }
  Write-Output '已为当前用户启用 CEP 开发扩展。这会允许其他未签名 CEP 面板加载；可将相应 PlayerDebugMode 值改为 0 关闭。'
}
Write-Output "插件已复制到：$taskPluginTarget"
Write-Output '请重启 AE，通过「窗口 → 扩展（旧版）/扩展 → 转播包装 · Live Bridge」打开。'
Write-Output 'AE 首选项中需启用「允许脚本写入文件和访问网络」。此脚本不会修改该 AE 首选项。'
if (!$EnableUnsignedExtensions) { Write-Output '这是未签名开发版。若 AE 拒绝加载，阅读 README.md 中的开发模式安装说明。' }
