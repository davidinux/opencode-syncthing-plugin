// @ts-nocheck - message.part.delta is valid runtime event type
import type { Plugin } from "@opencode-ai/plugin";
import { getConfig, saveConfig } from "./config.js";
import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync, readdirSync, writeFileSync, unlinkSync, statSync } from "fs";
import { execSync } from "child_process";

// ==================== Syncthing API ====================

interface SyncthingFolder {
  id: string;
  path: string;
}

async function getApiUrl(): Promise<string> {
  const config = getConfig();
  return config.syncthingApiUrl || "http://localhost:8384";
}

async function getApiKey(): Promise<string | undefined> {
  const config = getConfig();
  return config.syncthingApiKey;
}

async function apiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
  const url = `${await getApiUrl()}/rest${endpoint}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  const apiKey = await getApiKey();
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

async function ping(): Promise<boolean> {
  try {
    const url = `${await getApiUrl()}/rest/system/ping`;
    const headers: Record<string, string> = {};
    const apiKey = await getApiKey();
    if (apiKey) {
      headers["X-API-Key"] = apiKey;
    }
    const response = await fetch(url, { headers });
    const data = await response.json();
    return data.ping === "pong";
  } catch {
    return false;
  }
}

async function getFolders(): Promise<SyncthingFolder[]> {
  try {
    const config = await apiRequest("/config");
    return config.folders || [];
  } catch {
    return [];
  }
}

async function getFolderId(): Promise<string | null> {
  try {
    const config = getConfig();
    if (config.folderId) return config.folderId;

    const folders = await getFolders();
    const storageDir =
      config.storageDir ||
      join(homedir(), ".local", "share", "opencode", "storage");

    const matchingFolder = folders.find(
      (f: SyncthingFolder) => {
        let folderPath = f.path;
        if (folderPath.startsWith("~/")) {
          folderPath = join(homedir(), folderPath.slice(2));
        }
        return folderPath === storageDir || folderPath === storageDir + "/";
      }
    );

    if (matchingFolder) {
      saveConfig({ ...config, folderId: matchingFolder.id });
      return matchingFolder.id;
    }

    return null;
  } catch {
    return null;
  }
}

async function rescanFolder(folderId: string): Promise<boolean> {
  try {
    await apiRequest(`/folder/${folderId}/rescan`, { method: "POST" });
    return true;
  } catch {
    return false;
  }
}

async function listenForSyncEvents(
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

// ==================== Session Export/Import Sync ====================

const SYNC_DIR = join(homedir(), ".local", "share", "opencode", "sync-export");

/**
 * Export a session using OpenCode CLI and save to sync directory
 */
async function exportSession(sessionId: string): Promise<boolean> {
  try {
    if (!existsSync(SYNC_DIR)) {
      const { mkdirSync } = await import("fs");
      mkdirSync(SYNC_DIR, { recursive: true });
    }

    const outputPath = join(SYNC_DIR, `${sessionId}.json`);
    
    // Use helper script to avoid process spawning issues
    const helperScript = join(homedir(), "Projects", "github", "davidinux", "opencode-syncthing-plugin", "export-helper.sh");
    
    if (!existsSync(helperScript)) {
      return false;
    }
    
    // Call helper script and capture output
    const result = execSync(`bash "${helperScript}" "${sessionId}" "${outputPath}"`, { 
      timeout: 30000,
      encoding: "utf8",
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Check if export was successful
    if (existsSync(outputPath)) {
      const stats = statSync(outputPath);
      return stats.size > 0;
    }
    
    return false;
  } catch (e: any) {
    // Log error to file for debugging
    try {
      const fs = await import("fs");
      fs.writeFileSync(
        join(homedir(), ".local", "share", "opencode", "export-error.log"),
        `${new Date().toISOString()}: ${e.message}\n`
      );
    } catch {}
    return false;
  }
}

/**
 * Import a session from synced file
 */
async function importSession(filePath: string): Promise<boolean> {
  try {
    const cmd = `opencode import ${filePath}`;
    execSync(cmd, { encoding: "utf8" });
    
    // Remove the file after successful import
    unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Watch for synced session files and import them
 */
async function watchForImportableSessions() {
  try {
    if (!existsSync(SYNC_DIR)) return;

    const files = readdirSync(SYNC_DIR).filter(f => f.endsWith(".json"));
    for (const file of files) {
      const fullPath = join(SYNC_DIR, file);
      // Run import in background (non-blocking)
      setTimeout(() => importSession(fullPath), 0);
    }
  } catch {
    // Silent
  }
}

// ==================== Local Session Data ====================

interface LocalSessionData {
  title?: string;
  slug?: string;
  model?: string;
  provider?: string;
  promptTokens?: number;
  completionTokens?: number;
  cost?: number;
}

function getLocalSessionData(sessionId: string): LocalSessionData | null {
  try {
    const basePath = join(homedir(), ".local", "share", "opencode", "storage");
    const sessionPath = join(basePath, "session");
    const messagePath = join(basePath, "message", sessionId);

    if (!existsSync(sessionPath)) return null;

    let result: LocalSessionData = {};

    // Read session file for title/slug
    const projectDirs = readdirSync(sessionPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const projectDir of projectDirs) {
      const sessionFile = join(sessionPath, projectDir, `${sessionId}.json`);
      if (existsSync(sessionFile)) {
        const content = readFileSync(sessionFile, "utf8");
        const data = JSON.parse(content);
        result.title = data.title;
        result.slug = data.slug;
        break;
      }
    }

    // Read message files for cost/tokens
    if (existsSync(messagePath)) {
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;
      let totalCost = 0;

      const messageFiles = readdirSync(messagePath).filter((f) =>
        f.endsWith(".json"),
      );

      for (const msgFile of messageFiles) {
        try {
          const msgContent = readFileSync(join(messagePath, msgFile), "utf8");
          const msgData = JSON.parse(msgContent);

          if (msgData.tokens) {
            totalPromptTokens += msgData.tokens.input || 0;
            totalCompletionTokens += msgData.tokens.output || 0;
          }
          if (msgData.cost) {
            totalCost += msgData.cost;
          }
          if (!result.model && msgData.modelID) {
            result.model = msgData.modelID;
          }
          if (!result.provider && msgData.providerID) {
            result.provider = msgData.providerID;
          }
        } catch {
          // Skip invalid message files
        }
      }

      result.promptTokens = totalPromptTokens;
      result.completionTokens = totalCompletionTokens;
      result.cost = totalCost;
    }

    return result;
  } catch {
    // Silent
  }
  return null;
}

// ==================== Sync Logic ====================

const syncedSessions = new Set<string>();
const syncedMessages = new Set<string>();
const messagePartsText = new Map<string, string[]>();
const messageMetadata = new Map<
  string,
  { role: string; sessionId: string; info: any }
>();
const syncTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 800;

function inferRole(textContent: string): "user" | "assistant" {
  const assistantPatterns = [
    /^(I'll|Let me|Here's|I can|I've|I'm going to|I will|Sure|Certainly|Of course)/i,
    /```[\s\S]+```/,
    /^(Yes|No),?\s+(I|you|we|this|that)/i,
    /\*\*[^*]+\*\*/,
    /^\d+\.\s+\*\*/,
  ];
  const userPatterns = [
    /\?$/,
    /^(create|fix|add|update|show|make|build|implement|write|delete|remove|change|modify|help|can you|please|I want|I need)/i,
    /^@/,
  ];
  for (const pattern of assistantPatterns) {
    if (pattern.test(textContent)) {
      return "assistant";
    }
  }
  for (const pattern of userPatterns) {
    if (pattern.test(textContent)) {
      return "user";
    }
  }
  return textContent.length > 500 ? "assistant" : "user";
}

async function doSyncSession(session: any) {
  try {
    const folderId = await getFolderId();
    if (!folderId) return;

    const projectPath = session.path?.cwd || session.cwd || session.directory;
    const modelId = session.modelID || session.model?.modelID || session.model;
    const providerId =
      session.providerID || session.model?.providerID || session.provider;
    const promptTokens =
      session.tokens?.input || session.usage?.promptTokens || 0;
    const completionTokens =
      session.tokens?.output || session.usage?.completionTokens || 0;
    const cost = session.cost || session.usage?.cost || 0;

    // Trigger Syncthing rescan
    await rescanFolder(folderId);
  } catch {
    // Silent
  }
}

async function doSyncMessage(
  sessionId: string,
  messageId: string,
  role: string,
  textContent: string,
) {
  try {
    const folderId = await getFolderId();
    if (!folderId) return;

    if (!textContent || textContent.trim().length === 0) {
      return;
    }

    // Trigger Syncthing rescan
    await rescanFolder(folderId);
  } catch {
    // Silent
  }
}

function trySyncMessage(messageId: string) {
  if (syncedMessages.has(messageId)) return;
  const metadata = messageMetadata.get(messageId);
  const textParts = messagePartsText.get(messageId);
  if (!metadata || !textParts || textParts.length === 0) return;
  const textContent = textParts.join("");
  if (!textContent.trim()) return;
  syncedMessages.add(messageId);
  doSyncMessage(
    metadata.sessionId,
    messageId,
    metadata.role,
    textContent,
  );
  messagePartsText.delete(messageId);
  messageMetadata.delete(messageId);
}

function scheduleSyncMessage(messageId: string) {
  const existing = syncTimeouts.get(messageId);
  if (existing) clearTimeout(existing);
  const timeout = setTimeout(() => {
    syncTimeouts.delete(messageId);
    trySyncMessage(messageId);
  }, DEBOUNCE_MS);
  syncTimeouts.set(messageId, timeout);
}

// ==================== Plugin Export ====================

export const OpenCodeSyncthingPlugin: Plugin = async ({ client }) => {
  // Import any synced sessions on startup (non-blocking)
  setTimeout(() => watchForImportableSessions(), 1000);

  // Start listening for incoming sync events
  try {
    const folderId = await getFolderId();
    if (folderId) {
      listenForSyncEvents(folderId, (event) => {
        // Sync event detected
      });
    }
  } catch {
    // Silent
  }

  return {
      event: async ({ event }) => {
        try {
          const props = event.properties as any;

          // Session events (handle created, updated, idle)
          if (
          event.type === "session.created" ||
          event.type === "session.updated" ||
          event.type === "session.idle" ||
          event.type === "session.diff"
        ) {
          // Try multiple ways to get session ID
          const props = event.properties as any;
          let sessionId = props?.sessionID || props?.info?.id || props?.id;
          
          // If we got short ID, try to get full ID from database
          if (sessionId && !sessionId.startsWith("ses_")) {
            try {
              const { execSync } = await import("child_process");
              const result = execSync(
                `sqlite3 ~/.local/share/opencode/opencode.db "SELECT id FROM session WHERE id LIKE '%${sessionId}' LIMIT 1"`,
                { encoding: "utf8" }
              ).trim();
              if (result) sessionId = result;
            } catch {}
          }
          
           if (sessionId) {
             if (event.type === "session.created") {
               if (syncedSessions.has(sessionId)) return;
               syncedSessions.add(sessionId);
             }

             // Export session for sync on any session event
             if (
               event.type === "session.idle" ||
               event.type === "session.diff" ||
               event.type === "session.updated"
             ) {
               setTimeout(() => {
                 exportSession(sessionId);
                 watchForImportableSessions();
               }, 1000);
               return;
             }

             doSyncSession(props);
           }
        }

        // Message metadata
        if (event.type === "message.updated") {
          const info = props?.info;
          if (info?.id && info?.sessionID && info?.role) {
            messageMetadata.set(info.id, {
              role: info.role,
              sessionId: info.sessionID,
              info,
            });
            if (messagePartsText.has(info.id)) {
              scheduleSyncMessage(info.id);
            }
          }
        }

        // Message text parts (handle both updated and delta events)
        // @ts-ignore - message.part.delta is a valid event type
        if (event.type === "message.part.updated" || (event as any).type === "message.part.delta") {
          const part = props?.part;
          if (part?.type === "text" && part?.messageID && part?.sessionID) {
            const messageId = part.messageID;
            const text = part.text || "";
            // For delta events, append to existing text
            if (event.type === "message.part.delta") {
              const existing = messagePartsText.get(messageId) || [];
              existing.push(text);
              messagePartsText.set(messageId, existing);
            } else {
              messagePartsText.set(messageId, [text]);
            }
            if (!messageMetadata.has(messageId)) {
              messageMetadata.set(messageId, {
                role: "unknown",
                sessionId: part.sessionID,
                info: {},
              });
            }
            scheduleSyncMessage(messageId);
          }
        }
      } catch {
        // Silent
      }
    },
  };
}
