@echo off
title Outbound Workflow Monitoring System Launcher
echo ================================================================
echo  STARTING OUTBOUND WORKFLOW MONITORING SYSTEM
echo ================================================================
echo.

cd /d "%~dp0"

echo [1/3] Starting Backend Server (SQLite, Express, Socket.io)...
start /b node server.js

echo [2/3] Starting Public HTTPS Tunnel for Phone Scanning...
start /b node keep_tunnel_alive.js

timeout /t 3 >nul

echo [3/3] Opening Laptop Mentor Dashboard...
start http://localhost:3000

echo.
echo ================================================================
echo  SYSTEM RUNNING!
echo ----------------------------------------------------------------
echo  Laptop Mentor Dashboard : http://localhost:3000
echo  Phone Scanner Public Link: See public_url.txt or console output
echo ================================================================
echo  Keep this window open while using the application.
echo ================================================================
pause
