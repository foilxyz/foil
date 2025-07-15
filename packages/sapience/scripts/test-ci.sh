#!/bin/bash

# Test CI setup locally
# This script simulates what GitHub Actions will do

echo "🧪 Testing E2E setup locally (similar to CI)"
echo "=============================================="

# Set CI environment
export CI=true
export NODE_ENV=development

# Install Playwright browsers (if not already installed)
echo "📦 Installing Playwright browsers..."
pnpm exec playwright install --with-deps chromium

# Run the tests
echo "🎭 Running Playwright tests..."
pnpm test:e2e

echo "✅ CI test simulation complete!"
echo ""
echo "If this passes, your GitHub CI should work 🎉"
echo "If it fails, fix the issues locally first." 