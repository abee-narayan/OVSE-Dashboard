@echo off
title OVSE Executive Dashboard Server
echo ===================================================================
echo     OVSE TRANSACTION INTELLIGENCE & EXECUTIVE DASHBOARD
echo ===================================================================
echo.
echo Starting local web server on port 3000...
echo.
echo Default Login Credentials:
echo   Username: admin
echo   Password: ovse2026!
echo.
echo Opening browser at http://localhost:3000...
echo.
start "" "http://localhost:3000"
node "%~dp0server.js"
pause
