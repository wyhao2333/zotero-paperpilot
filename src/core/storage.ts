import { ChatMessage, ChatSession, PaperHistory, PDFChatHistory } from "../types/zotero";

export class StorageManager {
  private static pdfMemoryCache: Map<string, PDFChatHistory> = new Map();
  private static legacyMemoryCache: Map<string, PaperHistory> = new Map();

  /**
   * Constructs an isolated storage key:
   * Prefer attachmentID (`pdf_${attachmentID}`) to guarantee per-PDF isolation.
   * Fallback to bibliographic `item_${itemKey}` when no attachmentID is available.
   */
  static getPDFStorageKey(attachmentID?: number, itemKey?: string): string {
    if (attachmentID && attachmentID > 0) {
      return `pdf_${attachmentID}`;
    }
    return `item_${itemKey || "unknown"}`;
  }

  /**
   * Retrieves PDF-isolated chat history with multi-session support and schema migration.
   */
  static async getPDFHistory(
    attachmentID?: number,
    itemKey?: string,
    title?: string
  ): Promise<PDFChatHistory> {
    const storageKey = this.getPDFStorageKey(attachmentID, itemKey);

    if (this.pdfMemoryCache.has(storageKey)) {
      return this.pdfMemoryCache.get(storageKey)!;
    }

    try {
      if (typeof Zotero !== "undefined" && Zotero.DataDirectory) {
        const storageDir = PathUtils.join(Zotero.DataDirectory.dir, "paperpilot", "history");
        await IOUtils.makeDirectory(storageDir, { ignoreExisting: true });

        // 1. Check primary isolated storage file
        const filePath = PathUtils.join(storageDir, `${storageKey}.json`);
        if (await IOUtils.exists(filePath)) {
          const content = await IOUtils.readUTF8(filePath);
          const parsed = JSON.parse(content);
          if (parsed && Array.isArray(parsed.sessions) && parsed.schemaVersion >= 2) {
            this.pdfMemoryCache.set(storageKey, parsed);
            return parsed;
          }
        }

        // 2. Legacy migration: check if old parent-item based unversioned file exists
        if (itemKey) {
          const legacyPath = PathUtils.join(storageDir, `${itemKey}.json`);
          if (await IOUtils.exists(legacyPath)) {
            const legacyContent = await IOUtils.readUTF8(legacyPath);
            const legacyParsed = JSON.parse(legacyContent);
            if (legacyParsed && Array.isArray(legacyParsed.messages)) {
              dump(`[PaperPilot Storage] Migrating legacy history for ${itemKey} -> ${storageKey}\n`);
              const initialSession: ChatSession = {
                id: "session_legacy_" + Date.now(),
                title: "默认会话",
                createdAt: legacyParsed.lastUpdated || Date.now(),
                lastUpdated: legacyParsed.lastUpdated || Date.now(),
                messages: legacyParsed.messages,
              };

              const migrated: PDFChatHistory = {
                schemaVersion: 2,
                storageKey,
                attachmentID,
                itemKey,
                title: legacyParsed.title || title || "",
                activeSessionId: initialSession.id,
                sessions: [initialSession],
                lastUpdated: Date.now(),
              };

              this.pdfMemoryCache.set(storageKey, migrated);
              await this.savePDFHistory(migrated);
              return migrated;
            }
          }
        }
      }
    } catch (e) {
      dump(`[PaperPilot Storage] Failed to read PDF history for ${storageKey}: ${e}\n`);
    }

    // Initialize fresh multi-session history
    const defaultSession: ChatSession = {
      id: "session_" + Date.now(),
      title: "对话 1",
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      messages: [],
    };

    const initial: PDFChatHistory = {
      schemaVersion: 2,
      storageKey,
      attachmentID,
      itemKey,
      title: title || "",
      activeSessionId: defaultSession.id,
      sessions: [defaultSession],
      lastUpdated: Date.now(),
    };

    this.pdfMemoryCache.set(storageKey, initial);
    return initial;
  }

  /**
   * Persists PDF-isolated chat history.
   */
  static async savePDFHistory(history: PDFChatHistory): Promise<void> {
    if (!history || !history.storageKey) return;
    history.lastUpdated = Date.now();
    this.pdfMemoryCache.set(history.storageKey, history);

    try {
      if (typeof Zotero !== "undefined" && Zotero.DataDirectory) {
        const storageDir = PathUtils.join(Zotero.DataDirectory.dir, "paperpilot", "history");
        await IOUtils.makeDirectory(storageDir, { ignoreExisting: true });
        const filePath = PathUtils.join(storageDir, `${history.storageKey}.json`);
        await IOUtils.writeUTF8(filePath, JSON.stringify(history, null, 2));
      }
    } catch (e) {
      dump(`[PaperPilot Storage] Failed to write PDF history for ${history.storageKey}: ${e}\n`);
    }
  }

  /**
   * Clears PDF history from memory and disk.
   */
  static async clearPDFHistory(attachmentID?: number, itemKey?: string): Promise<void> {
    const storageKey = this.getPDFStorageKey(attachmentID, itemKey);
    this.pdfMemoryCache.delete(storageKey);

    try {
      if (typeof Zotero !== "undefined" && Zotero.DataDirectory) {
        const storageDir = PathUtils.join(Zotero.DataDirectory.dir, "paperpilot", "history");
        const filePath = PathUtils.join(storageDir, `${storageKey}.json`);
        if (await IOUtils.exists(filePath)) {
          await IOUtils.remove(filePath);
        }
      }
    } catch (e) {
      dump(`[PaperPilot Storage] Failed to clear PDF history for ${storageKey}: ${e}\n`);
    }
  }

  /**
   * Creates a new session within a PDF history.
   */
  static createSession(history: PDFChatHistory, title?: string): ChatSession {
    const sessionNum = (history.sessions?.length || 0) + 1;
    const session: ChatSession = {
      id: "session_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      title: title || `对话 ${sessionNum}`,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      messages: [],
    };
    if (!history.sessions) history.sessions = [];
    history.sessions.push(session);
    history.activeSessionId = session.id;
    return session;
  }

  /**
   * Deletes a session within a PDF history, maintaining at least one active session.
   */
  static deleteSession(history: PDFChatHistory, sessionId: string): void {
    if (!history.sessions) return;
    history.sessions = history.sessions.filter((s) => s.id !== sessionId);
    if (history.sessions.length === 0) {
      this.createSession(history, "对话 1");
    } else if (history.activeSessionId === sessionId) {
      history.activeSessionId = history.sessions[0].id;
    }
  }

  /**
   * Backward-compatibility wrapper for single-item flat history.
   */
  static async getHistory(itemKey: string): Promise<PaperHistory> {
    if (!itemKey) {
      return { itemKey: "unknown", title: "", messages: [], lastUpdated: Date.now() };
    }
    const pdfHist = await this.getPDFHistory(undefined, itemKey);
    const activeSession =
      pdfHist.sessions.find((s) => s.id === pdfHist.activeSessionId) || pdfHist.sessions[0];
    return {
      itemKey,
      title: pdfHist.title,
      messages: activeSession ? activeSession.messages : [],
      lastUpdated: pdfHist.lastUpdated,
    };
  }

  /**
   * Backward-compatibility wrapper for saving single-item flat history.
   */
  static async saveHistory(history: PaperHistory): Promise<void> {
    if (!history || !history.itemKey) return;
    const pdfHist = await this.getPDFHistory(undefined, history.itemKey, history.title);
    let activeSession = pdfHist.sessions.find((s) => s.id === pdfHist.activeSessionId);
    if (!activeSession) {
      activeSession = this.createSession(pdfHist);
    }
    activeSession.messages = history.messages;
    activeSession.lastUpdated = Date.now();
    await this.savePDFHistory(pdfHist);
  }

  /**
   * Backward-compatibility wrapper for clearing single-item flat history.
   */
  static async clearHistory(itemKey: string): Promise<void> {
    await this.clearPDFHistory(undefined, itemKey);
    this.legacyMemoryCache.delete(itemKey);
  }
}
