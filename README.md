# APT Production Logging App 2026

A high-efficiency, Streamlit-based production logging system designed for the APT 2026 workflow. This application streamlines the recording of hourly production output across multiple specialized machines, ensuring data integrity and facilitating audit trails.

## 📝 Project Overview
This tool replaces manual logging with a standardized digital interface. It allows operators and supervisors to:
*   **Log Production**: Record component-specific production quantities in real-time.
*   **Machine Tracking**: Categorize logs by specific machines (`vim1`, `vim2`, `vim3`, `vim4`, `him`).
*   **Automated Auditing**: Every entry is timestamped and attributed to both the operator and the person entering the data.
*   **Data Portability**: Saves records in clean CSV formats and maintains detailed text logs for administrative review.

## 🚀 Quick Start

### For Linux / Raspberry Pi
1. Open a terminal in this folder.
2. Run the setup script:
   ```bash
   chmod +x setup.sh run.sh
   ./setup.sh
   ```
3. Launch the app:
   ```bash
   ./run.sh
   ```

### For Windows
1. Double-click `setup.bat` to create the virtual environment and install dependencies.
2. Double-click `run.bat` to launch the application.

## 📂 Project Structure
- `app.py`: Main application logic.
- `requirements.txt`: List of Python dependencies.
- `APT_Production_Master.xlsx`: Master list of components.
- `aptvenv/`: Local Python virtual environment (auto-generated, ignored by Git).
- `production_data_2026/`: Local storage for logged entries and audit logs (ignored by Git).

## 🛠 Tech Stack
- **Python 3**
- **Streamlit** (UI Framework)
- **Pandas** (Data Processing)
- **OpenPyXL** (Excel Support)
