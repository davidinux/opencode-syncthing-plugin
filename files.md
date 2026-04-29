# Files

Brief description of each file in the opencode-syncthing-plugin codebase.

## Root

| File | Description |
|------|-------------|
| `package.json` | Package configuration, dependencies, scripts, and npm metadata |
| `tsconfig.json` | TypeScript compiler configuration |
| `README.md` | Project documentation, setup instructions, and usage guide |
| `.gitignore` | Git ignore patterns for node_modules, dist, etc. |

## src/

| File | Description |
|------|-------------|
| `index.ts` | OpenCode plugin that triggers Syncthing rescan on events. Mirrors opencode-sync-plugin's event handling, adds incoming sync detection. |
| `cli.ts` | CLI tool for verify, sync, status, config, logout, version commands |
| `config.ts` | Config helpers for Syncthing settings (`~/.config/opencode-syncthing-plugin/config.json`) |
| `syncthing.ts` | Syncthing REST API client using `syncthing` npm package |

## dist/ (generated)

| File | Description |
|------|-------------|
| `index.js` | Compiled plugin module (ESM) |
| `cli.js` | Compiled CLI binary |
| `config.js` | Compiled config module |
| `syncthing.js` | Compiled Syncthing client module |
| `*.d.ts` | TypeScript declaration files |
