# Changelog

## [0.1.0] - 2026-04-29

### Added
- Initial release mimicking opencode-sync-plugin architecture
- Syncthing P2P sync integration (replaces cloud sync)
- Event-driven plugin using OpenCode plugin specification
- Incoming sync detection (new feature not in original)
- CLI commands: verify, sync, status, config, logout
- Local session data reading from OpenCode storage
- Debounced message processing (800ms)
- Session idle delay for accurate title sync (1s)

### Features
- Mirrors opencode-sync-plugin's event handling exactly
- Uses `syncthing` npm package for robust REST API interaction
- Config stored at `~/.config/opencode-syncthing-plugin/config.json`
- No cloud dependency - all data stays on your machines
- Privacy-focused: No data sent to third-party services
