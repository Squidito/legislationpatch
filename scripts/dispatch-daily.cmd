@echo off
REM dispatch-daily.cmd -- what the Windows scheduled task actually runs.
REM
REM Wrapper only. All the logic (and all the safety notes) live in
REM scripts/dispatch-daily.js. This exists so the task has one stable command,
REM a fixed working directory, and a log that does NOT land in the repo
REM (SCRIPT-CONVENTIONS.md section 5).
REM
REM NEVER pushes. NEVER commits. NEVER pings IndexNow -- see the JS header.
REM
REM Register/inspect/remove:  see _personal/SESSION-2026-08-14.md

setlocal
set "REPO=%~dp0.."
set "LOGDIR=%LOCALAPPDATA%\legislationpatch"
set "LOG=%LOGDIR%\dispatch-daily.log"

if not exist "%LOGDIR%" mkdir "%LOGDIR%"

cd /d "%REPO%" || exit /b 1

echo. >> "%LOG%"
echo ======================================================== >> "%LOG%"
echo Run started %DATE% %TIME% >> "%LOG%"
node scripts\dispatch-daily.js --apply >> "%LOG%" 2>&1
set "RC=%ERRORLEVEL%"
echo Run finished %DATE% %TIME%  exit=%RC% >> "%LOG%"

exit /b %RC%
