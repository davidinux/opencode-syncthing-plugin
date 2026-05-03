#!/bin/bash
# Export all sessions to sync-export folder

EXPORT_DIR="$HOME/.local/share/opencode/sync-export"
mkdir -p "$EXPORT_DIR"

# Get all session IDs from database
sessions=$(sqlite3 "$HOME/.local/share/opencode/opencode.db" "SELECT id FROM session ORDER BY time_updated DESC LIMIT 20")

count=0
for session in $sessions; do
  # Skip if not a valid session ID
  if [[ ! "$session" =~ ^ses_ ]]; then
    continue
  fi
  
  # Check if already exported
  if [ -f "$EXPORT_DIR/${session}.json" ]; then
    continue
  fi
  
  # Export session to file - output only JSON to stdout
  output=$(opencode export "$session" 2>/dev/null)
  if [ $? -eq 0 ] && [ -n "$output" ]; then
    echo "$output" > "$EXPORT_DIR/${session}.json"
    ((count++))
  fi
done

echo "Exported $count sessions to $EXPORT_DIR"