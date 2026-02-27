# APT Production Logging App 2026

A Streamlit-based application for logging hourly production data across multiple machines (`vim1`-`vim4`, `him`).

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
