@echo off
cd /d "%~dp0"
echo Zylith is running at http://localhost:4173
echo Press Ctrl+C in this window to stop it.
start "" http://localhost:4173
py -m http.server 4173
