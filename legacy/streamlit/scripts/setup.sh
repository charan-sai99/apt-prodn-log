#!/bin/bash

# Exit on error
set -e

# Move to the project root (one level up from scripts/)
cd "$(dirname "$0")/.."

echo "------------------------------------------------"
echo "Setting up APT Production Logging App (Linux/Pi)"
echo "------------------------------------------------"

# Check for python3
if ! command -v python3 &> /dev/null
then
    echo "Python3 could not be found. Please install it first."
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "aptvenv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv aptvenv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source aptvenv/bin/activate

# Install requirements
echo "Installing dependencies from requirements.txt..."
pip install --upgrade pip
pip install -r requirements.txt

# Create Desktop Symbolic Link
DESKTOP_DIR="$HOME/Desktop"
if [ -d "$DESKTOP_DIR" ]; then
    echo "Creating Desktop symbolic link..."
    ln -sf "$(pwd)/run.sh" "$DESKTOP_DIR/APT_Production_Log"
    chmod +x "$(pwd)/run.sh"
    chmod +x "$(pwd)/scripts/run.sh"
    echo "Shortcut created on Desktop: APT_Production_Log"
fi

echo ""
echo "------------------------------------------------"
echo "Setup complete!"
echo "To run the app, use: ./scripts/run.sh"
echo "------------------------------------------------"
