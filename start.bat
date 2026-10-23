@echo off
cd /d "%~dp0"
echo ========================================================
echo   Starting VoltNest Storefront & Owner Control Room
echo ========================================================
echo.
echo Opening http://localhost:8085 in your browser...
start http://localhost:8085
echo.
echo Server running at http://localhost:8085
echo Press Ctrl+C to stop the server.
echo.
node tools/serve.cjs
pause
