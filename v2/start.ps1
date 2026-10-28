$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$env:PORT='8124'
$env:FBP_NO_BROWSER='1'
$env:FBP_STATE_FILE=Join-Path $root 'control\state.json'
$base='http://localhost:8124'
try {
    $running=Invoke-RestMethod ($base+'/version.json') -TimeoutSec 2
    if ($running.version -eq 2) {Start-Process ($base+'/control/panel.html');exit 0}
    throw '8124 端口已被其他服务使用。'
} catch {
    if (Get-NetTCPConnection -LocalPort 8124 -State Listen -ErrorAction SilentlyContinue) {throw '8124 端口已被其他服务使用，请先关闭该服务。'}
}
if (-not (Test-Path -LiteralPath $env:FBP_STATE_FILE)) {
    $source=Join-Path (Split-Path $root -Parent) 'control\state.json'
    if (-not (Test-Path -LiteralPath $source)) {$source=Join-Path $root 'control\state.example.json'}
    . (Join-Path $root 'initialize.ps1')
    Initialize-V2State $source $env:FBP_STATE_FILE
}
Write-Host '第二版控台：http://localhost:8124/control/panel.html'
Write-Host '第二版播出：http://localhost:8124/titles/graphics.html'
Write-Host '关闭此窗口将停止第二版。原版使用 8123 端口。'
Start-Process ($base+'/control/panel.html')
if (Get-Command node -ErrorAction SilentlyContinue) {& node (Join-Path $root 'control\serve.js')}
else {& (Join-Path $root 'control\serve.ps1')}
