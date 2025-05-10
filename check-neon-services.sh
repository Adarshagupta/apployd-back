#!/bin/bash

# Script to check the status of all Neon services
echo "=== Neon Services Health Check ==="

# Get current directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo -e "\n[1] Checking Docker status..."
if ! docker info > /dev/null 2>&1; then
  echo "❌ Error: Docker is not running. Please start Docker and try again."
  exit 1
else
  echo "✅ Docker is running"
fi

echo -e "\n[2] Checking Docker containers..."
CONTAINERS=$(docker-compose -f "$SCRIPT_DIR/docker-compose/docker-compose.yml" ps --format json 2>/dev/null || echo "[]")
if [[ "$CONTAINERS" == "[]" ]]; then
  echo "❌ No Neon containers are running. Run ./start-neon.sh to start services."
  exit 1
else
  echo "✅ Neon containers are running"
  docker-compose -f "$SCRIPT_DIR/docker-compose/docker-compose.yml" ps
fi

echo -e "\n[3] Checking port availability..."
# Check compute endpoint
if curl -s "http://localhost:3080/status" | grep -q "invalid authorization token"; then
  echo "✅ Compute API is reachable at http://localhost:3080"
else
  echo "❌ Compute API is not responding at http://localhost:3080"
fi

# Check pageserver endpoint
if curl -s "http://localhost:9898/v1/status" >/dev/null 2>&1; then
  echo "✅ Pageserver API is reachable at http://localhost:9898"
else
  echo "❌ Pageserver API is not responding at http://localhost:9898"
fi

# Check PostgreSQL port
if nc -z localhost 55433 >/dev/null 2>&1; then
  echo "✅ PostgreSQL is listening on port 55433"
else
  echo "❌ PostgreSQL is not listening on port 55433"
fi

echo -e "\n[4] Attempting to connect to PostgreSQL..."
# Try to connect to PostgreSQL
if command -v psql >/dev/null 2>&1; then
  PGCONNECT=$(PGPASSWORD=cloud_admin psql -h localhost -p 55433 -U cloud_admin -d postgres -c "SELECT version();" 2>&1)
  if [[ "$PGCONNECT" == *"PostgreSQL"* ]]; then
    echo "✅ Successfully connected to PostgreSQL"
    echo "   $PGCONNECT"
  else
    echo "❌ Failed to connect to PostgreSQL: $PGCONNECT"
  fi
else
  echo "⚠️ psql command not found, skipping direct PostgreSQL connection test"
fi

echo -e "\n[5] Checking UI dependencies..."
if [ -d "$SCRIPT_DIR/neon-ui/node_modules" ]; then
  echo "✅ UI dependencies are installed"
else
  echo "❌ UI dependencies are not installed. Run 'cd neon-ui && npm install'"
fi

echo -e "\n[6] Checking vite.config.js..."
if grep -q "target: 'http://localhost:3080'" "$SCRIPT_DIR/neon-ui/vite.config.js"; then
  echo "✅ vite.config.js is properly configured for compute API"
else
  echo "❌ vite.config.js is not properly configured. Check port mappings."
fi

echo -e "\n=== Summary ==="
echo "If all checks passed, your Neon services should be working properly."
echo "If there are issues, please run ./start-neon.sh to restart the services."
echo "If problems persist, check Docker logs with: docker-compose -f docker-compose/docker-compose.yml logs" 