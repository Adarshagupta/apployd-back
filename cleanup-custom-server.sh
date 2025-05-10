#!/bin/bash

# Script to clean up the custom PostgreSQL server
echo "=== Cleaning up custom PostgreSQL server ==="

# Get current directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/neon-ui" || {
  echo "Error: Could not find neon-ui directory"
  exit 1
}

# Kill any running custom server processes
echo "Stopping any running custom PostgreSQL server processes..."
pkill -f "node postgres-server.js" > /dev/null 2>&1 || true

# Remove the custom server file
echo "Removing custom PostgreSQL server file..."
if [ -f postgres-server.js ]; then
  rm postgres-server.js
  echo "✅ postgres-server.js removed"
else
  echo "postgres-server.js not found, skipping"
fi

# Remove the custom server run script
echo "Removing custom run script..."
if [ -f run.sh ]; then
  rm run.sh
  echo "✅ run.sh removed" 
else
  echo "run.sh not found, skipping"
fi

echo ""
echo "=== CLEANUP COMPLETE ==="
echo "Your Neon UI is now properly configured to use the real Neon backend."
echo "To start the full Neon stack, run: ./start-neon.sh" 