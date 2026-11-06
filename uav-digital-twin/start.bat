@echo off
echo ===================================================
echo Starting UAV Engine Digital Twin Dashboard
echo ===================================================

echo [1/2] Launching Backend FastAPI Server (port 8000)...
if exist "%~dp0backend\.venv\Scripts\activate.bat" (
    start "UAV Backend - FastAPI" cmd /k "cd /d %~dp0backend && .\.venv\Scripts\activate && uvicorn main:app --reload --reload-dir . --reload-dir ..\api\lib --port 8000"
) else (
    start "UAV Backend - FastAPI" cmd /k "cd /d %~dp0backend && .\venv\Scripts\activate && uvicorn main:app --reload --reload-dir . --reload-dir ..\api\lib --port 8000"
)

timeout /t 2 /nobreak >nul

echo [2/2] Launching Frontend React App (port 5173)...
start "UAV Frontend - Vite" cmd /k "cd /d %~dp0frontend && npm run dev"

timeout /t 3 /nobreak >nul

echo Opening dashboard in default browser...
start http://localhost:5173

echo ===================================================
echo Both services are running!
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo ===================================================
