@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not defined PORT set PORT=8123
title Football Broadcast Server - close this window to stop
where node >nul 2>nul
if not errorlevel 1 goto use_node
echo [NOTICE] Node.js not found. Falling back to PowerShell (may need admin rights)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
goto end
:use_node
echo [START] Starting football broadcast server with Node.js...
echo [URL]   Control panel : http://localhost:%PORT%/control/panel.html
echo [URL]   Preview       : http://localhost:%PORT%/control/preview.html
echo [INFO]  Opening control panel...  (if a page error appears, open the URL above)
node "%~dp0serve.js"
:end
pause
