@echo off
title LankaPOS Local Server Runner
echo Starting Lanka Mega POS Local Server...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
