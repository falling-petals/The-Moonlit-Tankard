@echo off
cd /d "%~dp0"
where uv >nul 2>nul
if not errorlevel 1 (
  uv run --locked python tools\launch.py
) else if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" tools\launch.py
) else (
  echo Please install uv and run: uv sync --locked
  pause
  exit /b 1
)
if errorlevel 1 pause
