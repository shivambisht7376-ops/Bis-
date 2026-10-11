@echo off
cd /d "%~dp0"
if not exist node_modules (call npm install)
echo Starting Black Ink Studios at http://localhost:8080
node server\server.js
pause
