@echo off
setlocal

REM Move to project root (one level up from scripts/)
cd /d "%~dp0.."

echo ------------------------------------------------
echo Setting up APT Production Logging App (Windows)
echo ------------------------------------------------

:: Check for python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Python is not installed or not in PATH. Please install Python first.
    pause
    exit /b 1
)

:: Create virtual environment if it doesn't exist
if not exist "aptvenv" (
    echo Creating virtual environment...
    python -m venv aptvenv
)

:: Activate virtual environment
echo Activating virtual environment...
call aptvenv\Scripts\activate

# Install requirements
echo Installing dependencies from requirements.txt...
python -m pip install --upgrade pip
pip install -r requirements.txt

:: Create Desktop Shortcut
echo Creating Desktop shortcut...
set "SCRIPT_PATH=%CD%\run.bat"
set "SHORTCUT_PATH=%USERPROFILE%\Desktop\APT_Production_Log.lnk"

powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%SHORTCUT_PATH%'); $Shortcut.TargetPath = '%SCRIPT_PATH%'; $Shortcut.WorkingDirectory = '%CD%'; $Shortcut.Save()"

if %errorlevel% equ 0 (
    echo Shortcut created on Desktop: APT_Production_Log
) else (
    echo Failed to create Desktop shortcut.
)

echo.
echo ------------------------------------------------
echo Setup complete!
echo To run the app, use: scripts\run.bat
echo ------------------------------------------------
pause
