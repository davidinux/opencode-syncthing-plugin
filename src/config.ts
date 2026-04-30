import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CONFIG_DIR = join(homedir(), ".config", "opencode-syncthing-plugin");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface SyncthingConfig {
  syncthingApiUrl?: string;
  syncthingApiKey?: string;
  storageDir?: string;
  folderId?: string;
}

export function getConfig(): SyncthingConfig {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return {};
    }
    const content = readFileSync(CONFIG_FILE, "utf8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export function saveConfig(config: SyncthingConfig): void {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
  } catch {
    // Silent fail
  }
}

export function clearConfig(): void {
  try {
    const { unlinkSync } = require("fs");
    if (existsSync(CONFIG_FILE)) {
      unlinkSync(CONFIG_FILE);
    }
  } catch {
    // Silent fail
  }
}
