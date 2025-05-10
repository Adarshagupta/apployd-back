#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse command line arguments
START_UI=true
for arg in "$@"; do
  case $arg in
    --no-ui)
      START_UI=false
      shift
      ;;
    *)
      # Unknown option
      ;;
  esac
done

echo -e "${BLUE}=== Starting Neon Services ===${NC}"

# Get current directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check Docker status
echo -e "${YELLOW}Checking Docker status...${NC}"
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}Docker is not running. Please start Docker first.${NC}"
  exit 1
fi

# Start Neon backend services
echo -e "${YELLOW}Starting Neon backend services...${NC}"
docker-compose -f "$SCRIPT_DIR/docker-compose/docker-compose.yml" up -d

# Wait for services to be ready
echo -e "${YELLOW}Waiting for services to start (this may take a minute)...${NC}"
# Wait for compute to be ready (up to 60 seconds)
ATTEMPTS=0
MAX_ATTEMPTS=20
while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
  if curl -s "http://localhost:3080/status" | grep -q "invalid authorization token"; then
    echo "Compute service is up and running at port 3080."
    break
  fi
  echo "Waiting for compute service to become available... ($((ATTEMPTS+1))/$MAX_ATTEMPTS)"
  ATTEMPTS=$((ATTEMPTS+1))
  sleep 3
done

if [ $ATTEMPTS -eq $MAX_ATTEMPTS ]; then
  echo "Warning: Compute service did not respond in time. Continuing anyway..."
fi

# Start the UI (only if --no-ui was not specified)
if [ "$START_UI" = true ]; then
  echo -e "${YELLOW}Starting Neon UI...${NC}"
  cd "$SCRIPT_DIR/neon-ui" || {
    echo "Error: Could not find neon-ui directory"
    exit 1
  }

  # Run the UI
  echo "Starting development server..."
  npm run dev
else
  echo -e "${YELLOW}Skipping UI startup (--no-ui flag provided)${NC}"
  echo -e "${GREEN}Neon backend services are running. Use the UI start script to start the frontend.${NC}"
fi

# Function to handle cleanup
function cleanup() {
  echo -e "\nStopping services..."
  cd "$SCRIPT_DIR"
  docker-compose -f "$SCRIPT_DIR/docker-compose/docker-compose.yml" down
  exit 0
}

# Set up trap to handle Ctrl+C
trap cleanup SIGINT SIGTERM

# Keep the script running
wait 