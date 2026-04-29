import { getConfig } from "./config.js";
import { homedir } from "os";
import { join } from "path";

export interface SyncthingFolder {
  id: string;
  path: string;
}

let cachedClient: any = null;

function getApiUrl(): string {
  const config = getConfig();
  return config.syncthingApiUrl || "http://localhost:8384";
}

function getApiKey(): string | undefined {
  const config = getConfig();
  return config.syncthingApiKey;
}

async function apiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
  const url = `${getApiUrl()}/rest${endpoint}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  const apiKey = getApiKey();
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json();
}

export async function ping(): Promise<boolean> {
  try {
    const response = await fetch(`${getApiUrl()}/rest/system/ping`, {
      headers: getApiKey() ? { "X-API-Key": getApiKey()! } : {},
    });
    const data = await response.json();
    return data.ping === "pong";
  } catch {
    return false;
  }
}

export async function getFolders(): Promise<SyncthingFolder[]> {
  try {
    const config = await apiRequest("/config");
    return config.folders || [];
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
      const { saveConfig } = await import("./config.js");
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
    await apiRequest(`/folder/${folderId}/rescan`, { method: "POST" });
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
    let lastEventId = 0;

    const poll = async () => {
      try {
        const events = await apiRequest(`/events?since=${lastEventId}&limit=100`);

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

      setTimeout(poll, 5000);
    };

    poll();
  } catch {
    // Silent
  }
}
