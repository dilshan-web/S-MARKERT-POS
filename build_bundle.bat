@echo off
title LankaPOS Bundle Builder
echo Building latest JavaScript bundle into index.html...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bundle.ps1"
pause
