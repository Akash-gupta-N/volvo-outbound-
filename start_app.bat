@echo off
title Outbound Workflow Monitoring System Launcher
cd /d "%~dp0"

echo ================================================================
echo  STARTING OUTBOUND WORKFLOW MONITORING SYSTEM
echo ================================================================
echo.

where node >nul 2>nul
if errorlevel 1 goto no_node

REM Dependencies are not committed to the repository, so a fresh clone has no
REM node_modules. Without this step the server exits immediately with
REM "Cannot find module 'express'".
if exist "node_modules\" goto deps_ok

echo [1/4] Installing dependencies. The first run takes a few minutes...
echo.
call npm install
if errorlevel 1 goto install_failed
echo.
goto deps_done

:deps_ok
echo [1/4] Dependencies already installed.

:deps_done
echo [2/4] Starting Backend Server (SQLite, Express, Socket.io)...
start /b node server.js

echo [3/4] Starting Public HTTPS Tunnel for Phone Scanning...
start /b node keep_tunnel_alive.js

timeout /t 3 >nul

echo [4/4] Opening Laptop Mentor Dashboard...
start http://localhost:3000

echo.
echo ================================================================
echo  SYSTEM RUNNING!
echo ----------------------------------------------------------------
echo  Laptop Mentor Dashboard   : http://localhost:3000
echo  Phone Scanner (this PC)   : https://localhost:3001/operator.html
echo  Phone Scanner Public Link : see public_url.txt or the console output
echo ================================================================
echo  Keep this window open while using the application.
echo ================================================================
pause
exit /b 0

:no_node
echo ERROR: Node.js was not found on PATH.
echo.
echo Install Node.js 18 or newer from https://nodejs.org
echo then close this window and run start_app.bat again.
echo.
pause
exit /b 1

:install_failed
echo.
echo ERROR: npm install failed - see the messages above.
echo.
echo A common cause is better-sqlite3 failing to build. Re-running the
echo Node.js installer and ticking "Tools for Native Modules" usually
echo fixes it.
echo.
pause
exit /b 1
