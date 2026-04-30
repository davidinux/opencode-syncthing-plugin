import type { Plugin } from "@opencode-ai/plugin";
import { getConfig } from "../config.js";
import { getFolderId, rescanFolder, listenForSyncEvents } from "../syncthing.js";
import { existsSync, readFileSync, readdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

console.error("opencode-syncthing: MODULE LOADED - This should appear when OpenCode loads the plugin");

// Track what we've already processed to avoid duplicates
const processedSessions = new Set<string>();
const processedMessages = new Set<string>();

// Store message parts and metadata to combine them
const messagePartsText = new Map<string, string[]>();
const messageMetadata = new Map<
  string,
  { role: string; sessionId: string; info: any }
>();

// Debounce map: messageId -> timeout
const syncTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 800;

// Incoming sync detection flag
let incomingSyncEnabled = false;

interface LocalSessionData {
  title?: string;
  slug?: string;
  model?: string;
  provider?: string;
  promptTokens?: number;
  completionTokens?: number;
  cost?: number;
}

/**
 * Read session data from OpenCode's local storage (session + messages)
 * Reuses original plugin's logic exactly
 */
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
        f.endsWith(".json")
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
          // Get model/provider from first message that has it
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

/**
 * Infer role from content patterns when metadata doesn't provide it
 * Reuses original plugin's logic exactly
 */
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

/**
 * Trigger Syncthing rescan of OpenCode storage folder
 * Replaces original's HTTP POST to cloud
 */
async function triggerSyncthingRescan(sessionId?: string) {
  try {
    const folderId = await getFolderId();
    if (!folderId) {
      return;
    }

    await rescanFolder(folderId);
  } catch {
    // Silent
  }
}

/**
 * Try to process a message if we have both metadata and text content
 * Reuses original's logic exactly
 */
function tryProcessMessage(messageId: string) {
  if (processedMessages.has(messageId)) return;
  const metadata = messageMetadata.get(messageId);
  const textParts = messagePartsText.get(messageId);
  if (!metadata || !textParts || textParts.length === 0) return;
  const textContent = textParts.join("");
  if (!textContent.trim()) return;
  processedMessages.add(messageId);

  // Message is complete, trigger Syncthing rescan
  triggerSyncthingRescan(metadata.sessionId);

  messagePartsText.delete(messageId);
  messageMetadata.delete(messageId);
}

/**
 * Schedule a debounced sync for a message
 * Reuses original's debounce logic exactly
 */
function scheduleProcessMessage(messageId: string) {
  const existing = syncTimeouts.get(messageId);
  if (existing) clearTimeout(existing);
  const timeout = setTimeout(() => {
    syncTimeouts.delete(messageId);
    tryProcessMessage(messageId);
  }, DEBOUNCE_MS);
  syncTimeouts.set(messageId, timeout);
}

/**
 * Handle incoming sync events from other machines
 * New feature not in original - detects sessions synced from other machines
 */
function handleIncomingSync(event: any) {
  try {
    if (event.data?.item?.startsWith("session/") || event.data?.item?.startsWith("message/")) {
      console.log(`[opencode-syncthing] New data synced: ${event.data?.item}`);
    }
  } catch {
    // Silent
  }
}

export const OpenCodeSyncthingPlugin: Plugin = async ({ client }: any) => {
  console.error("opencode-syncthing: Plugin function called - START");
  // Initialize plugin - use any to avoid type issues
  try {
    await client.app.log({
      level: "info",
      message: "opencode-syncthing: Plugin initialized - mimicking opencode-sync-plugin with Syncthing",
    } as any);
    console.error("opencode-syncthing: Plugin initialized - SUCCESS");
  } catch (error) {
    console.error("Plugin init error:", error);
  }

  // Start incoming sync detection if enabled
  if (!incomingSyncEnabled) {
    incomingSyncEnabled = true;
    getFolderId().then((folderId) => {
      if (folderId) {
        listenForSyncEvents(folderId, handleIncomingSync);
        client.app.log({
          level: "info",
          message: "opencode-syncthing: Incoming sync detection enabled",
        } as any);
      }
    });
  }

  return {
    // Subscribe to events - mirrors original exactly
    event: async ({ event }: any) => {
      try {
        const props = (event as any).properties;

        // Session events - mirrors original
        if (
          event.type === "session.created" ||
          event.type === "session.updated" ||
          event.type === "session.idle"
        ) {
          const sessionId = props?.id;
          if (sessionId) {
            if (event.type === "session.created") {
              if (processedSessions.has(sessionId)) return;
              processedSessions.add(sessionId);
            }

            // On session.idle, delay then read from local storage
            if (event.type === "session.idle") {
              setTimeout(() => {
                const localData = getLocalSessionData(sessionId);
                // Trigger Syncthing rescan to sync the updated data
                triggerSyncthingRescan(sessionId);
              }, 1000); // 1 second delay for file write (same as original)
              return;
            }

            // For created/updated, trigger immediate rescan
            triggerSyncthingRescan(sessionId);
          }
        }

        // Message metadata - mirrors original
        if (event.type === "message.updated") {
          const info = props?.info;
          if (info?.id && info?.sessionID && info?.role) {
            messageMetadata.set(info.id, {
              role: info.role,
              sessionId: info.sessionID,
              info,
            });
            if (messagePartsText.has(info.id)) {
              scheduleProcessMessage(info.id);
            }
          }
        }

        // Message text parts - mirrors original
        if (event.type === "message.part.updated") {
          const part = props?.part;
          if (part?.type === "text" && part?.messageID && part?.sessionID) {
            const messageId = part.messageID;
            const text = part.text || "";
            messagePartsText.set(messageId, [text]);
            if (!messageMetadata.has(messageId)) {
              messageMetadata.set(messageId, {
                role: "unknown",
                sessionId: part.sessionID,
                info: {},
              });
            }
            scheduleProcessMessage(messageId);
          }
        }
      } catch {
        // Silent
      }
    },
  };
};

export default OpenCodeSyncthingPlugin;
