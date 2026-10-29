@echo off
rem Metal Calendar - double-click to start (keep the minimized PowerShell window open while using)
start "MetalCalendar" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\server.ps1"
