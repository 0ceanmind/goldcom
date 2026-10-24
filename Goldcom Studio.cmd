@echo off
rem Goldcom Studio launcher for Windows: double-click this file (or the Desktop shortcut).
rem Installs components / builds the editor when needed, starts the studio, opens the browser,
rem and starts the studio again after an in-app update (the server exits with code 75).
setlocal EnableExtensions
title Goldcom Studio

rem An update can replace this file while it runs, and cmd.exe reads scripts as it goes,
rem so the real work runs from a copy in %TEMP%.
if not defined GOLDCOM_HOME (
  set "GOLDCOM_HOME=%~dp0"
  fc /b "%~f0" "%TEMP%\goldcom-studio-launcher.cmd" >nul 2>&1 || copy /y "%~f0" "%TEMP%\goldcom-studio-launcher.cmd" >nul 2>&1
  fc /b "%~f0" "%TEMP%\goldcom-studio-launcher.cmd" >nul 2>&1 && (
    call "%TEMP%\goldcom-studio-launcher.cmd" %*
    exit /b
  )
)

cd /d "%GOLDCOM_HOME%studio" 2>nul || goto :no_studio

call :find_node
if errorlevel 1 call :refresh_path
call :find_node
if errorlevel 1 call :install_node
call :find_node
if errorlevel 1 goto :no_node

if /i "%~1"=="/install" node scripts\launcher.mjs shortcut

node scripts\launcher.mjs prepare
set "RC=%errorlevel%"
if "%RC%"=="3" exit /b 0
if not "%RC%"=="0" goto :failed

start "" /b node scripts\launcher.mjs open
set "GOLDCOM_LAUNCHER=1"

:run
title Goldcom Studio
node server\index.mjs
set "RC=%errorlevel%"
if not "%RC%"=="75" goto :stopped
echo.
echo   Restarting Goldcom Studio...
node scripts\launcher.mjs prepare --restart
if errorlevel 1 goto :failed
goto :run

:stopped
if "%RC%"=="0" exit /b 0
echo.
echo   Goldcom Studio stopped unexpectedly (code %RC%).
goto :pause_exit

:find_node
set "NODE_MAJOR="
where node >nul 2>&1 || exit /b 1
for /f "tokens=1 delims=v." %%v in ('node -v 2^>nul') do set "NODE_MAJOR=%%v"
if not defined NODE_MAJOR exit /b 1
if %NODE_MAJOR% LSS 20 exit /b 2
exit /b 0

:refresh_path
rem Node.js installed a moment ago is not on this window's PATH yet: reload it from the registry.
for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"`) do set "PATH=%%p"
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
exit /b 0

:install_node
where winget >nul 2>&1 || exit /b 1
echo.
echo   Goldcom Studio needs Node.js 20 or newer. Installing it now...
echo   (Windows may ask for permission. Click Yes.)
echo.
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
call :refresh_path
exit /b 0

:no_node
echo.
if defined NODE_MAJOR echo   This computer has Node.js %NODE_MAJOR%, but Goldcom Studio needs version 20 or newer.
echo   Please install Node.js LTS from https://nodejs.org (opening it in your browser now),
echo   then double-click Goldcom Studio again.
echo   If you just installed Node.js, close this window and open Goldcom Studio again.
start "" https://nodejs.org/en/download
goto :pause_exit

:no_studio
echo.
echo   Could not find the "studio" folder next to this launcher.
echo   Keep "Goldcom Studio.cmd" inside the Goldcom folder, or use the Desktop shortcut.
goto :pause_exit

:failed
echo.
echo   Goldcom Studio could not start. See the messages above.

:pause_exit
echo.
pause
exit /b 1
