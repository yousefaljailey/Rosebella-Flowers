@echo off
title Rosebella Local Server
echo.
echo  Starting Rosebella server...
echo.
cd /d "%~dp0"
node server.js
echo.
echo  Server stopped. Press any key to close.
pause >nul
