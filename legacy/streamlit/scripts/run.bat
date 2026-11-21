@echo off
TITLE APT Production Logging App

REM Move to project root (one level up from scripts/)
cd /d "%~dp0.."

REM Activate virtual environment if it exists
if exist "aptvenv\Scripts\activate.bat" (
    call aptvenv\Scripts\activate
)

REM Run Streamlit app
echo Starting APT Production Logging App...
streamlit run src\app.py --server.port 8501

pause
