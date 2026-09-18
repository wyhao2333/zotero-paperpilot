import { ChatMessage, PaperHistory } from "../types/zotero";

export class StorageManager {
  private static memoryCache: Map<string, PaperHistory> = new Map();

  static async getHistory(itemKey: string): Promise<PaperHistory> {
    if (!itemKey) {
      return { itemKey: "unknown", title: "", messages: [], lastUpdated: Date.now() };
    }

    if (this.memoryCache.has(itemKey)) {
      return this.memoryCache.get(itemKey)!;
    }

    try {
      if (typeof Zotero !== "undefined" && Zotero.DataDirectory) {
        const storageDir = PathUtils.join(Zotero.DataDirectory.dir, "paperpilot", "history");
        await IOUtils.makeDirectory(storageDir, { ignoreExisting: true });
        const filePath = PathUtils.join(storageDir, `${itemKey}.json`);

        const exists = await IOUtils.exists(filePath);
        if (exists) {
          const content = await IOUtils.readUTF8(filePath);
          const history: PaperHistory = JSON.parse(content);
          this.memoryCache.set(itemKey, history);
          return history;
        }
      }
    } catch (e) {
      dump(`[PaperPilot Storage] Failed to read history for ${itemKey}: ${e}\n`);
    }

    const initial: PaperHistory = {
      itemKey,
      title: "",
      messages: [],
      lastUpdated: Date.now(),
    };
    this.memoryCache.set(itemKey, initial);
    return initial;
  }

  static async saveHistory(history: PaperHistory): Promise<void> {
    if (!history || !history.itemKey) return;
    history.lastUpdated = Date.now();
    this.memoryCache.set(history.itemKey, history);

    try {
      if (typeof Zotero !== "undefined" && Zotero.DataDirectory) {
        const storageDir = PathUtils.join(Zotero.DataDirectory.dir, "paperpilot", "history");
        await IOUtils.makeDirectory(storageDir, { ignoreExisting: true });
        const filePath = PathUtils.join(storageDir, `${history.itemKey}.json`);
        await IOUtils.writeUTF8(filePath, JSON.stringify(history, null, 2));
      }
    } catch (e) {
      dump(`[PaperPilot Storage] Failed to write history for ${history.itemKey}: ${e}\n`);
    }
  }

  static async clearHistory(itemKey: string): Promise<void> {
    this.memoryCache.delete(itemKey);
    try {
      if (typeof Zotero !== "undefined" && Zotero.DataDirectory) {
        const storageDir = PathUtils.join(Zotero.DataDirectory.dir, "paperpilot", "history");
        const filePath = PathUtils.join(storageDir, `${itemKey}.json`);
        if (await IOUtils.exists(filePath)) {
          await IOUtils.remove(filePath);
        }
      }
    } catch (e) {
      dump(`[PaperPilot Storage] Failed to clear history for ${itemKey}: ${e}\n`);
    }
  }
}
