@echo off
REM One-step publish: stage everything, commit, push to GitHub. Render redeploys automatically.
REM Usage:  deploy "what you changed"
cd /d "%~dp0"
set MSG=%~1
if "%MSG%"=="" set MSG=Update website
git add -A
git diff --cached --quiet && (echo Nothing to publish. & exit /b 0)
git commit -m "%MSG%"
echo.
echo Done. GitHub is updated and Render is redeploying (about 1-2 minutes).
echo https://bis-e2dt.onrender.com
