@echo off
chcp 65001 >nul
title Football Broadcast V2
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\start.ps1"
if errorlevel 1 pause
