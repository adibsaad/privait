#!/bin/bash

# Directory to store models
DIR="$LLAMA_MODEL_LOCATION"
mkdir -p "$DIR"

# Number of download retries
MAX_RETRIES=3

# List of model URLs
MODEL_URLS=(
    "https://huggingface.co/CompendiumLabs/bge-small-en-v1.5-gguf/resolve/main/bge-small-en-v1.5-f32.gguf"
    "https://huggingface.co/itlwas/SmolLM2-360M-Instruct-Q4_K_M-GGUF/resolve/main/smollm2-360m-instruct-q4_k_m.gguf"
)

# Function to get filename from URL
get_filename() {
    local url="$1"
    # Extract last part of URL before ?download=true
    basename "${url%%\?*}"
}


# Function to download a file with retries safely
download_with_retry() {
    local url="$1"
    local dest="$2"
    local attempt=1
    local tmp_dest="$dest.part"

    while [[ $attempt -le $MAX_RETRIES ]]; do
        echo "Attempt $attempt: Downloading $dest ..."
        curl -L --progress-bar "$url" -o "$tmp_dest"
        if [[ $? -eq 0 ]]; then
            mv "$tmp_dest" "$dest"
            echo "Downloaded $dest successfully."
            return 0
        else
            echo "Download failed. Retrying..."
            ((attempt++))
            sleep 2
        fi
    done

    echo "Failed to download $dest after $MAX_RETRIES attempts."
    # Remove incomplete file so next run retries
    [[ -f "$tmp_dest" ]] && rm "$tmp_dest"
    return 1
}

# Download each model
for URL in "${MODEL_URLS[@]}"; do
    FILE_NAME=$(get_filename "$URL")
    DEST="$DIR/$FILE_NAME"

    if [[ -f "$DEST" ]]; then
        echo "Skipping $FILE_NAME — already exists at $DEST"
        continue
    fi

    download_with_retry "$URL" "$DEST"
done

echo "All downloads complete."
