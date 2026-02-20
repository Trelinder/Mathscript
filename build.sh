#!/bin/bash
set -e
echo "Starting build process from: $(pwd)"

# Install and build in the frontend directory
cd frontend
echo "Installing frontend dependencies in $(pwd)..."
npm install
echo "Building frontend..."
npm run build
echo "Frontend build complete."

# Return to root for potential future steps
cd ..
echo "Build process finished."
