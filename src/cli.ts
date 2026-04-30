#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { getConfig, saveConfig, clearConfig } from "./config.js";
import { ping, getFolders, getFolderId } from "./syncthing.js";
import { homedir } from "os";
import { join } from "path";

const program = new Command();

program
  .name("opencode-syncthing")
  .description("OpenCode Syncthing Plugin CLI (mimics opencode-sync-plugin)")
  .version("0.1.0");

program
  .command("verify")
  .description("Verify Syncthing connection and OpenCode config")
  .action(async () => {
    console.log(chalk.bold("\n  OpenCode Syncthing Setup Verification\n"));

    const config = getConfig();
    const hasApiUrl = !!config.syncthingApiUrl || true; // Has default
    const hasApiKey = !!config.syncthingApiKey;

    console.log("  Syncthing Config:", hasApiUrl ? chalk.green("OK") : chalk.red("Missing"));
    if (config.syncthingApiUrl) {
      console.log("  API URL:", config.syncthingApiUrl);
    }
    if (hasApiKey) {
      console.log("  API Key:", "****" + config.syncthingApiKey?.slice(-4));
    }

    // Check Syncthing connection
    console.log("\n  Syncthing Connection:");
    const isRunning = await ping();
    if (isRunning) {
      console.log("  Status:", chalk.green("Connected"));
      
      // Check folder
      const folderId = await getFolderId();
      if (folderId) {
        console.log("  Folder ID:", folderId);
        console.log("  OpenCode Storage:", chalk.green("Synced"));
      } else {
        console.log("  Folder ID:", chalk.yellow("Not detected"));
        console.log("  OpenCode Storage:", chalk.yellow("Not shared in Syncthing"));
        console.log("  Expected path:", join(homedir(), ".local", "share", "opencode", "storage"));
      }
    } else {
      console.log("  Status:", chalk.red("Not running"));
      console.log("  Make sure Syncthing is running at", config.syncthingApiUrl || "http://localhost:8384");
    }

    // Check OpenCode config
    console.log("\n  OpenCode Config:");
    const opencodeConfigPath = join(homedir(), ".config", "opencode", "opencode.json");
    const { existsSync, readFileSync } = await import("fs");
    if (existsSync(opencodeConfigPath)) {
      try {
        const content = readFileSync(opencodeConfigPath, "utf8");
        const config = JSON.parse(content);
        const hasPlugin = config.plugin?.includes("opencode-syncthing-plugin");
        console.log("  Config file:", opencodeConfigPath);
        console.log("  Plugin registered:", hasPlugin ? chalk.green("Yes") : chalk.red("No"));
      } catch {
        console.log("  Config file:", chalk.red("Invalid JSON"));
      }
    } else {
      console.log("  Config file:", chalk.yellow("Not found"));
      console.log("  Create with: mkdir -p ~/.config/opencode && echo '{\"plugin\": [\"opencode-syncthing-plugin\"]}' > ~/.config/opencode/opencode.json");
    }

    console.log("\n  " + (isRunning ? chalk.green("Ready!") : chalk.yellow("Setup incomplete")) + "\n");
  });

program
  .command("sync")
  .description("Trigger manual rescan of OpenCode storage folder")
  .action(async () => {
    const folderId = await getFolderId();
    if (!folderId) {
      console.log(chalk.red("OpenCode storage folder not found in Syncthing"));
      return;
    }

    const { rescanFolder } = await import("./syncthing.js");
    const success = await rescanFolder(folderId);
    if (success) {
      console.log(chalk.green("Rescan triggered for folder:"), folderId);
    } else {
      console.log(chalk.red("Failed to trigger rescan"));
    }
  });

program
  .command("status")
  .description("Show Syncthing connection and sync status")
  .action(async () => {
    console.log(chalk.bold("\n  OpenCode Syncthing Status\n"));

    const isRunning = await ping();
    console.log("  Syncthing Running:", isRunning ? chalk.green("Yes") : chalk.red("No"));
    
    if (isRunning) {
      const folderId = await getFolderId();
      const folders = await getFolders();
      console.log("  Shared Folders:", folders.length);
      
      if (folderId) {
        console.log("  OpenCode Folder:", chalk.green("Found - " + folderId));
      } else {
        console.log("  OpenCode Folder:", chalk.yellow("Not found"));
        console.log("  Expected path:", join(homedir(), ".local", "share", "opencode", "storage"));
      }
    }
    
    console.log("");
  });

program
  .command("config")
  .description("Show or update Syncthing configuration")
  .option("--set-api-url <url>", "Set Syncthing API URL")
  .option("--set-api-key <key>", "Set Syncthing API Key")
  .option("--set-storage-dir <path>", "Set OpenCode storage directory")
  .action(async (options) => {
    if (options.setApiUrl || options.setApiKey || options.setStorageDir) {
      const config = getConfig();
      if (options.setApiUrl) config.syncthingApiUrl = options.setApiUrl;
      if (options.setApiKey) config.syncthingApiKey = options.setApiKey;
      if (options.setStorageDir) config.storageDir = options.setStorageDir;
      saveConfig(config);
      console.log(chalk.green("Configuration updated"));
    } else {
      const config = getConfig();
      console.log(chalk.bold("\n  Current Configuration\n"));
      console.log("  API URL:", config.syncthingApiUrl || "http://localhost:8384 (default)");
      console.log("  API Key:", config.syncthingApiKey ? "****" + config.syncthingApiKey.slice(-4) : "Not set");
      console.log("  Storage Dir:", config.storageDir || join(homedir(), ".local", "share", "opencode", "storage") + " (default)");
      console.log("  Folder ID:", config.folderId || "Not detected");
      console.log("");
    }
  });

program
  .command("logout")
  .description("Clear stored configuration")
  .action(() => {
    clearConfig();
    console.log(chalk.green("Configuration cleared"));
  });

program.parse();
