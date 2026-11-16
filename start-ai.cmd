@echo off
setlocal
cd /d "%~dp0"
rem Credentials are read only from the Python service environment.
call start.cmd
