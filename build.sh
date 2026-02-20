#!/bin/bash
set -e
echo "Starting build process..."
cd frontend
echo "Installing frontend dependencies..."
npm install
echo "Building frontend..."
npm run build
echo "Build complete."
