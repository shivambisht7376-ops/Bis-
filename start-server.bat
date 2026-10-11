@echo off
cd /d "%~dp0"
if not exist node_modules (call npm install)
if not exist .env (
  echo.
  echo  .env file not found. Copy .env.example to .env and paste your Neon DATABASE_URL into it.
  echo.
  pause
  exit /b 1
)
echo Starting Black Ink Studios at http://localhost:8080
call npm start
pause
