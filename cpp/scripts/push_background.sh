```bash
#!/bin/bash

set -e

SOURCE_FILE="$1"
OUTPUT_NAME="${2:-}"
CUT_TIME="${3:-}"

if [ -z "$SOURCE_FILE" ]; then
    echo "Usage:"
    echo "  ./push_background.sh <video-path> [output-name] [cut-time]"
    echo
    echo "Examples:"
    echo "  ./push_background.sh ~/Videos/background.mp4"
    echo "  ./push_background.sh ~/Videos/background.mp4 forest"
    echo "  ./push_background.sh ~/Videos/background.mp4 forest 30"
    echo "  ./push_background.sh ~/Videos/background.mp4 forest 00:01:30"
    exit 1
fi

if [ ! -f "$SOURCE_FILE" ]; then
    echo "Source video does not exist:"
    echo "$SOURCE_FILE"
    exit 1
fi

read -p "Enter Raspberry Pi IP address: " PI_IP

if [ -z "$PI_IP" ]; then
    echo "No IP address entered."
    exit 1
fi

OUTPUT_DIR="backgrounds"
mkdir -p "$OUTPUT_DIR"

if [ -z "$OUTPUT_NAME" ]; then
    OUTPUT_NAME="background_$(date +%Y%m%d_%H%M%S)"
fi

OUTPUT_FILE="${OUTPUT_DIR}/${OUTPUT_NAME}.mp4"

REMOTE_USER="user"
REMOTE_DIR="/home/user/EyeTracker/assets/backgrounds"

echo
echo "Source video:"
echo "$SOURCE_FILE"

echo
echo "Converting to 640x360 H.264 @ 24 FPS..."

if [ -n "$CUT_TIME" ]; then
    echo "Skipping first $CUT_TIME..."

    ffmpeg \
        -y \
        -ss "$CUT_TIME" \
        -i "$SOURCE_FILE" \
        -vf "scale=640:360" \
        -r 24 \
        -c:v libx264 \
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
        -c:v libx264\
        -preset medium \
        -crf 23 \
        -pix_fmt yuv420p \
        -an \
        "$OUTPUT_FILE"
fi

echo
echo "Converted:"
echo "$OUTPUT_FILE"

if [ ! -f "$OUTPUT_FILE" ]; then
    echo "Converted file does not exist:"
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
```

