#!/bin/bash
# Helper script to export OpenCode sessions
# This script is called by the plugin to avoid process spawning issues

SESSION_ID="$1"
OUTPUT_PATH="$2"
TMP_FILE="${OUTPUT_PATH}.tmp"

if [ -z "$SESSION_ID" ] || [ -z "$OUTPUT_PATH" ]; then
  echo "Usage: $0 <sessionId> <outputPath>"
  exit 1
fi

# Run opencode export and save to temp file
opencode export "$SESSION_ID" --print-logs > "$TMP_FILE" 2>&1

# Extract just the JSON part (find first line starting with {)
JSON_START=$(grep -n '^{' "$TMP_FILE" | head -1 | cut -d: -f1)

if [ -n "$JSON_START" ]; then
  # Extract JSON from that line to the end
  tail -n +${JSON_START} "$TMP_FILE" > "$OUTPUT_PATH"
  rm -f "$TMP_FILE"
  echo "SUCCESS: Exported to $OUTPUT_PATH"
  exit 0
else
  rm -f "$TMP_FILE"
  echo "ERROR: Invalid output format"
  exit 1
fi
