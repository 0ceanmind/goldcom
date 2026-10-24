@echo off
rem One-time setup for people who downloaded Goldcom as a ZIP: adds the "Goldcom Studio" shortcut
rem to the Desktop, then starts the studio. After this, updates come from the Update button in the
rem studio (the first update turns this folder into a git checkout when Git is installed).
setlocal EnableExtensions
title Goldcom Studio
set "GS_DIR=%~dp0"
echo.
echo   Setting up Goldcom Studio...
rem Files unpacked from a downloaded ZIP are marked "from the internet"; unblock them so Windows stops asking.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath $env:GS_DIR -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notlike '*\node_modules\*' } | Unblock-File -ErrorAction SilentlyContinue" >nul 2>&1
rem Same line on purpose: an update may replace this file while the studio runs.
call "%~dp0Goldcom Studio.cmd" /install & exit /b
