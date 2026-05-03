# opencode-syncthing-plugin

Sync your OpenCode sessions between machines via Syncthing P2P sync (mimics opencode-sync-plugin architecture).

[![npm version](https://img.shields.io/npm/v/opencode-syncthing-plugin.svg)](https://www.npmjs.com/package/opencode-syncthing-plugin)

## Features

- **P2P Sync**: Uses Syncthing for decentralized, private sync between your machines
- **Session Export/Import**: Automatically exports sessions on idle, imports synced sessions on startup
- **Event-Driven**: Mirrors opencode-sync-plugin's event handling (session/message events)
- **No Cloud Required**: All data stays on your machines, synced via Syncthing

## Installation

### From npm (when published)

```bash
npm install -g opencode-syncthing-plugin
```

### From source

```bash
git clone https://github.com/davidinux/opencode-syncthing-plugin.git
cd opencode-syncthing-plugin
npm install
npm run build
npm install -g .  # Optional: install globally
```

### Configure OpenCode to use the plugin

```bash
# Install globally (recommended - uses ~/.config/opencode/opencode.jsonc)
opencode plugin --global /path/to/opencode-syncthing-plugin
```

**To run CLI commands from source (without global install):**

```bash
node dist/cli.js <command>
# Example: node dist/cli.js config --set-api-url http://localhost:8384
```

**Or install globally (makes `opencode-syncthing` available everywhere):**

```bash
npm install -g .
# Then you can run: opencode-syncthing <command>
```

### From source

```bash
git clone https://github.com/davidinux/opencode-syncthing-plugin.git
cd opencode-syncthing-plugin
npm install
npm run build
```

**To run CLI commands from source (without global install):**

```bash
node dist/cli.js <command>
# Example: node dist/cli.js config --set-api-url http://localhost:8384
```

**Or install globally (makes `opencode-syncthing` available everywhere):**

```bash
npm install -g .
# Then you can run: opencode-syncthing <command>
```

## Prerequisites

1. **Syncthing installed and running** on all machines you want to sync
2. **OpenCode storage directory** shared in Syncthing:
   - Default path: `~/.local/share/opencode/storage`
   - Add this folder to Syncthing on all machines

## Setup

### 1. Configure the plugin

**If globally installed:**
```bash
opencode-syncthing config --set-api-url http://localhost:8384
opencode-syncthing config --set-api-key YOUR_API_KEY  # Optional, if Syncthing requires auth
```

**If running from source (not globally installed):**
```bash
node dist/cli.js config --set-api-url http://localhost:8384
node dist/cli.js config --set-api-key YOUR_API_KEY  # Optional
```

**Or install globally from source:**
```bash
npm install -g .
# Then use: opencode-syncthing config --set-api-url http://localhost:8384
```

### 2. Add to OpenCode

**Quick setup (global config):**

```bash
mkdir -p ~/.config/opencode && echo '{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-syncthing-plugin"]
}' > ~/.config/opencode/opencode.json
```

**Or manually add** to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-syncthing-plugin"]
}
```

### 3. Verify installation

**If globally installed:**
```bash
opencode-syncthing verify
```

**If running from source:**
```bash
node dist/cli.js verify
```

This checks that Syncthing is running and OpenCode storage is shared.

## How it works

The plugin hooks into OpenCode events and uses OpenCode's export/import commands to sync sessions:

| Event                  | Action                                                 |
| ---------------------- | ------------------------------------------------------ |
| `session.created`      | Triggers Syncthing rescan of storage folder           |
| `session.updated`      | Triggers Syncthing rescan                              |
| `session.idle`         | **Exports session**, triggers Syncthing rescan        |
| `message.updated`      | Captures message metadata                             |
| `message.part.updated` | Captures message text, triggers rescan after debounce  |
| `message.part.delta`   | Captures message text (what OpenCode actually sends) |

**Sync Flow:**
1. On **session.idle**, plugin exports session to `~/.local/share/opencode/sync-export/SESSION_ID.json`
2. **Syncthing syncs** the JSON file to other machines
3. On **plugin startup** (or after export), plugin **imports** any synced JSON files via `opencode import`
4. Session appears in OpenCode on the other machine!

## CLI Commands

**If globally installed:**
| Command                      | Description                                         |
| ---------------------------- | --------------------------------------------------- |
| `opencode-syncthing verify`   | Verify Syncthing connection and OpenCode config     |
| `opencode-syncthing sync`     | Manual trigger rescan of storage folder             |
| `opencode-syncthing status`   | Show Syncthing connection and sync status           |
| `opencode-syncthing config`   | Show or update Syncthing configuration               |
| `opencode-syncthing logout`   | Clear stored configuration                          |
| `opencode-syncthing version`  | Show installed version                              |
| `opencode-syncthing help`     | Show help message                                   |

**If running from source (not globally installed):**
Replace `opencode-syncthing` with `node dist/cli.js` in the commands above.

## Configuration storage

Configuration is stored at:

```
~/.config/opencode-syncthing-plugin/
  config.json       # Syncthing API URL, API Key, storage dir
```

Session export files are stored at:

```
~/.local/share/opencode/sync-export/
  SESSION_ID.json  # Exported session (synced via Syncthing)
```

## Plugin architecture

This plugin follows the [OpenCode plugin specification](https://opencode.ai/docs/plugins/) and closely mirrors opencode-sync-plugin:

```typescript
import type { Plugin } from "@opencode-ai/plugin";

export const OpenCodeSyncthingPlugin: Plugin = async ({ client }) => {
  // Initialize plugin (runs when OpenCode loads the plugin)
  
  return {
    // Subscribe to events (same as opencode-sync-plugin)
    event: async ({ event }) => {
      // Handle session/message events
      // Trigger Syncthing rescan instead of cloud sync
    },
  };
};
```

## Differences from opencode-sync-plugin

| Feature | opencode-sync-plugin | opencode-syncthing-plugin |
|---------|---------------------|---------------------------|
| Sync Backend | Convex Cloud (OpenSync.dev) | Syncthing P2P |
| Requires Cloud Account | Yes | No |
| Data Privacy | Stored in cloud | Only on your machines |
| Incoming Sync Detection | No | Yes (new feature) |
| Web Dashboard | OpenSync.dev | Use Syncthing web UI |

## Troubleshooting

### OpenCode won't start or shows blank screen

Remove the plugin from config:

```bash
rm ~/.config/opencode/opencode.json
# Or edit to remove the plugin line
```

Clear plugin cache:

```bash
rm -rf ~/.cache/opencode/node_modules/opencode-syncthing-plugin
```

### "Syncthing not running" errors

Make sure Syncthing is running:

```bash
syncthing --version
```

Check Syncthing web UI at http://localhost:8384

### OpenCode storage folder not found in Syncthing

Add the folder to Syncthing:

1. Open Syncthing web UI
2. Add folder pointing to `~/.local/share/opencode/storage`
3. Share with your other devices

### Still having issues?

Open an issue on [GitHub](https://github.com/davidinux/opencode-syncthing-plugin/issues)

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev
```

## Links

- [OpenCode](https://opencode.ai/)
- [Syncthing](https://syncthing.net/)
- [opencode-sync-plugin (original)](https://github.com/waynesutton/opencode-sync-plugin)
- [Report Issues](https://github.com/davidinux/opencode-syncthing-plugin/issues)

## License

MIT
