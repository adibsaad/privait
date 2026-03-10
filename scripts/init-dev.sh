#!/bin/bash

# Script assumes all dependencies (pnpm, docker services, direnv, etc.) are running and initialized

# cd to current directory of the file
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Download models
echo "📥 Downloading models..."
./download-models.sh

# Init db
echo "🗄️ Initializing database..."
cd "$DIR/.."
pnpm db:create
pnpm db:drizzle:push
pnpm db:drizzle:push:test

# Initialize rustfs
cd "$DIR/../src/server"
echo "🦀 Initializing rustfs..."
./node_modules/.bin/tsx scripts/init-fs.ts

# Print success message
echo "✅ Development environment initialized successfully! 🎉"
