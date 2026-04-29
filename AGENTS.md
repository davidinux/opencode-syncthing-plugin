# AGENTS.md - opencode-syncthing-plugin

## Project Overview

This plugin mimics the architecture of `opencode-sync-plugin` but uses Syncthing P2P sync instead of cloud sync.

## Key Design Decisions

- Mirrors `opencode-sync-plugin` event handling exactly
- Uses `syncthing` npm package for REST API (robust, maintained)
- Replaces HTTP POST to cloud with `rescanFolder()` calls
- Adds incoming sync detection (not in original)
- All data stays on user's machines (no cloud dependency)

## Build Commands

```bash
npm install    # Install dependencies
npm run build  # Compile TypeScript to dist/
```

## Testing

1. Verify plugin loads: Add to `~/.config/opencode/opencode.json`:
   ```json
   {"plugin": ["opencode-syncthing-plugin"]}
   ```
2. Test CLI: `node dist/cli.js verify`
3. Test with real Syncthing: Ensure Syncthing running on port 8384

## Git Workflow

- Work on `dev` branch
- Use signed commits: `git commit -a --signoff`
- Push to `dev`, create PR to `main` for review
- User reviews and merges PRs
