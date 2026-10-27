@echo off
setlocal
cd /d "%~dp0"
if exist "ai-key.txt" (
  set /p AI_KEY=<ai-key.txt
) else (
  set /p AI_KEY=Paste DashScope API key (sk-...): 
)
if "%AI_KEY%"=="" (
  echo [WARN] No key provided - launching without AI dialogue.
) else (
  set "DASHSCOPE_API_KEY=%AI_KEY%"
  echo [OK] AI key loaded for this session only.
)
python tools\launch.py
if errorlevel 1 pause
