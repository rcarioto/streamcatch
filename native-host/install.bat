@echo off
REM Install StreamCatch native messaging host for Firefox on Windows.
REM Prefer Python 3 launchers; never assume bare "python" is Python 3.
setlocal
cd /d "%~dp0"

where py >nul 2>&1
if %ERRORLEVEL%==0 (
  py -3 "%~dp0install_host.py"
  exit /b %ERRORLEVEL%
)

where python3 >nul 2>&1
if %ERRORLEVEL%==0 (
  python3 "%~dp0install_host.py"
  exit /b %ERRORLEVEL%
)

where python >nul 2>&1
if %ERRORLEVEL%==0 (
  python -c "import sys; raise SystemExit(0 if sys.version_info[0] >= 3 else 1)" >nul 2>&1
  if %ERRORLEVEL%==0 (
    python "%~dp0install_host.py"
    exit /b %ERRORLEVEL%
  )
  echo The "python" command on PATH is Python 2. Looking for python3 failed.
  echo Install Python 3 or use: py -3 install_host.py
  exit /b 1
)

echo Python 3 was not found on PATH.
echo Install Python from https://www.python.org/downloads/
echo and enable "Add python.exe to PATH".
exit /b 1
