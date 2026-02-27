#!/bin/bash

# Move to project root (one level up from scripts/)
cd "$(dirname "$0")/.."

# Activate virtual environment
if [ -d "aptvenv" ]; then
    source aptvenv/bin/activate
fi

# Run Streamlit app
echo "Starting APT Production Logging App..."
streamlit run src/app.py --server.port 8501
