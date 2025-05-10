#!/bin/bash

# This script runs the Neon UI from the root directory
echo "Starting Neon UI application..."

# Change to the neon-ui directory
cd "$(dirname "$0")/neon-ui" || {
  echo "Error: Could not change to neon-ui directory"
  exit 1
}

echo "Working directory: $(pwd)"

# Check if PostgreSQL is running
if command -v pg_isready > /dev/null; then
  pg_isready -h localhost -p 5432
  PG_STATUS=$?
  if [ $PG_STATUS -ne 0 ]; then
    echo "Warning: PostgreSQL is not running. Databases will be simulated."
  else
    echo "PostgreSQL is running and ready."
  fi
else
  echo "Warning: PostgreSQL tools not found."
fi

# Kill any existing processes
echo "Stopping any existing servers..."
pkill -f "node postgres-server.js" > /dev/null 2>&1 || true
pkill -f "node.*vite" > /dev/null 2>&1 || true

# Use system user for PostgreSQL connection
USER_NAME=$(whoami)
echo "Configuring for user: $USER_NAME"

# Update connection settings to use your system username
sed -i.bak "s/user: 'postgres'/user: '$USER_NAME'/" src/api/neonApi.js
sed -i.bak "s/password: 'postgres'/password: ''/" src/api/neonApi.js
sed -i.bak "s/user: 'postgres'/user: '$USER_NAME'/" postgres-server.js
sed -i.bak "s/password: 'postgres'/password: ''/" postgres-server.js

# Start server
echo "Starting PostgreSQL API server..."
node postgres-server.js &
PG_PID=$!

# Wait a moment for the server to start
sleep 2

# Start frontend
echo "Starting Vite development server..."
npx vite &
VITE_PID=$!

# Cleanup on exit
function cleanup() {
  echo "Stopping servers..."
  kill $PG_PID $VITE_PID > /dev/null 2>&1 || true
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

echo ""
echo "Application is running!"
echo "- Frontend: http://localhost:5173"
echo "- API Server: http://localhost:3081"
echo ""
echo "Press Ctrl+C to stop all servers."

# Keep the script running
wait 