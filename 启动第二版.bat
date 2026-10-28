@echo off
chcp 65001 >nul
title Football Broadcast V2
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0v2\start.ps1"
if errorlevel 1 pause
