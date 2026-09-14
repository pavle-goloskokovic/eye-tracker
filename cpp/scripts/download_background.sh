#!/bin/bash

set -e
CUT_TIME="${3:-}"
if [ -z "$1" ]; then
    echo "Usage:"
    echo "  ./download_background.sh \"<youtube-url>\" [output-name]"
    exit 1
fi

read -p "Enter Raspberry Pi IP address: " PI_IP

URL="$1"

OUTPUT_DIR="backgrounds"
mkdir -p "$OUTPUT_DIR"

if [ -n "$2" ]; then
    OUTPUT_NAME="$2"
else
    OUTPUT_NAME="background_$(date +%Y%m%d_%H%M%S)"
fi

OUTPUT_FILE="${OUTPUT_DIR}/${OUTPUT_NAME}.mp4"

REMOTE_USER="user"
REMOTE_DIR="/home/user/EyeTracker/assets/backgrounds"

TEMP_DIR=$(mktemp -d)

cleanup()
{
    rm -rf "$TEMP_DIR"
}

trap cleanup EXIT

echo
echo "Downloading video..."

yt-dlp \
    --no-playlist \
    -f "bestvideo[height<=360]/best[height<=360]" \
    -o "${TEMP_DIR}/source.%(ext)s" \
    "$URL"

SOURCE_FILE=$(find "$TEMP_DIR" -maxdepth 1 -type f | head -n 1)

if [ -z "$SOURCE_FILE" ]; then
    echo "Could not find downloaded video."
    exit 1
fi

echo
echo "Downloaded:"
echo "$SOURCE_FILE"

echo
echo "Converting to 640x360 H.264 @ 24 FPS..."
echo "Skipping first 30 seconds..."

if [ -n "$CUT_TIME" ]; then
    echo "Skipping first $CUT_TIME..."

    ffmpeg \
        -y \
        -ss "$CUT_TIME" \
        -i "$SOURCE_FILE" \
        -vf "scale=640:360" \
        -r 24 \
        -c:v libopenh264 \
        -preset medium \
        -crf 23 \
        -pix_fmt yuv420p \
        -an \
        "$OUTPUT_FILE"
else
    echo "Converting full video..."

    ffmpeg \
        -y \
        -i "$SOURCE_FILE" \
        -vf "scale=640:360" \
        -r 24 \
        -c:v libx264 \
        -preset medium \
        -crf 23 \
        -pix_fmt yuv420p \
        -an \
        "$OUTPUT_FILE"
fi
echo
echo "Converted:"
echo "$OUTPUT_FILE"

if [ -z "$PI_IP" ]; then
    echo "No IP address entered."
    exit 1
fi

if [ ! -f "$OUTPUT_FILE" ]; then
    echo "File does not exist:"
    echo "$OUTPUT_FILE"
    exit 1
fi

FILENAME=$(basename "$OUTPUT_FILE")

echo
echo "Sending to Raspberry Pi..."
echo "${REMOTE_USER}@${PI_IP}:${REMOTE_DIR}/${FILENAME}"

scp \
    -i ~/.ssh/fl3ka \
    "$OUTPUT_FILE" \
    "${REMOTE_USER}@${PI_IP}:${REMOTE_DIR}/${FILENAME}.part"

ssh \
    -i ~/.ssh/fl3ka \
    "${REMOTE_USER}@${PI_IP}" \
    "mv '${REMOTE_DIR}/${FILENAME}.part' '${REMOTE_DIR}/${FILENAME}'"

echo
echo "Upload complete."

rm -f "$OUTPUT_FILE"

echo "Local converted file removed."
echo "Done."
