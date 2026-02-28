#!/bin/bash

# Script assumes all dependencies (pnpm, docker services, direnv, etc.) are running and initialized

# cd to current directory of the file
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Download models
./download-models.sh


# Initialize rustfs
echo "Initializing rustfs..."
cd "$DIR/../src/server"
./node_modules/.bin/tsx scripts/init-fs.ts

# Print success message
echo "Development environment initialized successfully!"
