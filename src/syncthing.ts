import { Syncthing } from "syncthing";
import { getConfig } from "./config.js";
import { homedir } from "os";
import { join } from "path";

export interface SyncthingFolder {
  id: string;
  path: string;
}

let syncthingClient: any = null;

function getClient() {
  if (syncthingClient) return syncthingClient;

  const config = getConfig();
  const apiUrl = config.syncthingApiUrl || "http://localhost:8384";
  const apiKey = config.syncthingApiKey;

  syncthingClient = new Syncthing({
    url: apiUrl,
    apiKey: apiKey || undefined,
  });

  return syncthingClient;
}

export async function ping(): Promise<boolean> {
  try {
    const client = getClient();
    const response = await client.system.ping();
    return response?.ping === "pong";
  } catch {
    return false;
  }
}

export async function getFolders(): Promise<SyncthingFolder[]> {
  try {
    const client = getClient();
    const folders = await client.config.folders();
    return folders || [];
  } catch {
    return [];
  }
}

export async function getFolderId(): Promise<string | null> {
  try {
    const config = getConfig();
    if (config.folderId) return config.folderId;

    const folders = await getFolders();
    const storageDir =
      config.storageDir ||
      join(homedir(), ".local", "share", "opencode", "storage");

    const matchingFolder = folders.find(
      (f: SyncthingFolder) =>
        f.path === storageDir || f.path === storageDir + "/"
    );

    if (matchingFolder) {
      // Save for future use
      const { saveConfig } = require("./config.js");
      saveConfig({ ...config, folderId: matchingFolder.id });
      return matchingFolder.id;
    }

    return null;
  } catch {
    return null;
  }
}

export async function rescanFolder(folderId: string): Promise<boolean> {
  try {
    const client = getClient();
    await client.folder.rescan(folderId);
    return true;
  } catch {
    return false;
  }
}

export async function listenForSyncEvents(
  folderId: string,
  callback: (event: any) => void
): Promise<void> {
  try {
    const client = getClient();
    let lastEventId = 0;

    const poll = async () => {
      try {
        const events = await client.events.list({
          since: lastEventId,
          limit: 100,
        });

        for (const event of events) {
          lastEventId = Math.max(lastEventId, event.id || 0);

          if (
            event.folder === folderId &&
            (event.type === "ItemFinished" || event.type === "LocalIndexUpdated")
          ) {
            callback(event);
          }
        }
      } catch {
        // Silent
      }

      setTimeout(poll, 5000); // Poll every 5 seconds
    };

    poll();
  } catch {
    // Silent
  }
}
