# Maintenance and Troubleshooting Guide

This page details how to maintain the APT Production Logging System and solve common issues.

## 🛠 Adding/Editing Products
The application pulls product data from the master Excel file.
1. Locate `data/APT_Production_Master.xlsx`.
2. Ensure you have columns: `component_name` and `component_id`.
3. Add your new data and save.
4. The app will update automatically on its next refresh (or press 'R' in the browser).

## 📂 Backup Strategy
Since production data is stored in the local `storage/` folder (and ignored by Git), we recommend a regular backup:
*   **Manual**: Copy the `storage/` folder to a secure network drive or USB.
*   **Automated**: Use a cron job (Linux) or Task Scheduler (Windows) to zip the `storage/` folder weekly.

## 🆘 Common Issues

### 1. App won't start (No module named 'streamlit')
**Cause**: The virtual environment isn't activated or dependencies aren't installed.
**Fix**: Run `scripts/setup.bat` (Windows) or `scripts/setup.sh` (Linux) to rebuild the environment.

### 2. Excel file not found
**Cause**: `APT_Production_Master.xlsx` was moved from the `data/` folder.
**Fix**: Ensure the file exists exactly at `data/APT_Production_Master.xlsx`.

### 3. Permissions Error (Linux/Pi)
**Cause**: The script doesn't have execute permissions.
**Fix**: Run `chmod +x scripts/run.sh scripts/setup.sh`.
