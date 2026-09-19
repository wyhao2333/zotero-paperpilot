export interface PaperDocumentContext {
  attachmentID: number;
  text: string;
  chunks: string[];
  extractedPages: number;
  totalPages: number;
}

export class PaperContextService {
  private static cache: Map<number, PaperDocumentContext> = new Map();

  /**
   * Resolves the PDF attachment item ID from a reader, Zotero Item, or ID.
   */
  static async resolveAttachmentID(target: any): Promise<number | null> {
    if (!target) return null;

    try {
      if (typeof target === "number") {
        if (typeof Zotero === "undefined" || !Zotero.Items?.getAsync) return target;
        const item = await Zotero.Items.getAsync(target);
        if (item) {
          if (item.isPDFAttachment?.()) return item.id;
          if (item.isRegularItem?.()) {
            const att = await item.getBestAttachment();
            if (att?.isPDFAttachment?.()) return att.id;
          }
        }
        return target;
      }

      // If target is a Reader instance
      if (target.itemID) {
        return await this.resolveAttachmentID(target.itemID);
      }

      // If target is an Item instance
      if (typeof target.isPDFAttachment === "function" && target.isPDFAttachment()) {
        return target.id;
      }

      if (typeof target.isRegularItem === "function" && target.isRegularItem()) {
        const att = await target.getBestAttachment();
        if (att && att.isPDFAttachment?.()) {
          return att.id;
        }
      }

      if (typeof target.isAttachment === "function" && target.isAttachment()) {
        return target.id;
      }
    } catch (e) {
      dump(`[PaperPilot] Error resolving attachment ID: ${e}\n`);
    }

    return null;
  }

  /**
   * Retrieves or extracts the full text of a PDF attachment via Zotero.PDFWorker.
   */
  static async getDocument(attachmentID: number): Promise<PaperDocumentContext> {
    if (this.cache.has(attachmentID)) {
      return this.cache.get(attachmentID)!;
    }

    let text = "";
    let extractedPages = 0;
    let totalPages = 0;

    if (typeof Zotero !== "undefined" && Zotero.PDFWorker?.getFullText) {
      try {
        const result = await Zotero.PDFWorker.getFullText(attachmentID);
        if (result) {
          text = result.text || "";
          extractedPages = result.extractedPages || 0;
          totalPages = result.totalPages || 0;
          dump(`[PaperPilot] paper context loaded pages=${extractedPages}/${totalPages}\n`);
        }
      } catch (err: any) {
        dump(`[PaperPilot] PDFWorker.getFullText error: ${err.message || err}\n`);
      }
    } else {
      dump("[PaperPilot] Zotero.PDFWorker.getFullText is not available in current environment\n");
    }

    const chunks = this.chunkText(text, 1800, 250);
    const docContext: PaperDocumentContext = {
      attachmentID,
      text,
      chunks,
      extractedPages,
      totalPages,
    };

    this.cache.set(attachmentID, docContext);
    return docContext;
  }

  /**
   * Retrieves relevant chunks of the paper matching the question and selection.
   */
  static async getRelevantContext(
    attachmentID: number,
    question: string,
    selectedText?: string
  ): Promise<string> {
    if (!attachmentID) return "";

    try {
      const doc = await this.getDocument(attachmentID);
      if (!doc || !doc.chunks.length) return "";

      // If document is small enough, include all chunks
      if (doc.chunks.length <= 5) {
        return doc.chunks
          .map((c, i) => `【论文片段 ${i + 1}】:\n${c}`)
          .join("\n\n");
      }

      // Keyword extraction & scoring
      const keywords = this.extractKeywords(`${question} ${selectedText || ""}`);
      const scored = doc.chunks.map((chunk, index) => {
        let score = 0;
        const lowerChunk = chunk.toLowerCase();

        for (const kw of keywords) {
          const occurrences = (lowerChunk.match(new RegExp(this.escapeRegExp(kw), "g")) || []).length;
          score += occurrences;
        }

        // Direct overlap with selected quote bonus
        if (selectedText && selectedText.length > 10) {
          const sample = selectedText.slice(0, 30).toLowerCase();
          if (lowerChunk.includes(sample)) {
            score += 10;
          }
        }

        return { index, chunk, score };
      });

      // Sort by score descending and take top 5-6
      const topPicks = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        // Re-sort to document order for natural reading
        .sort((a, b) => a.index - b.index);

      return topPicks
        .map((item, i) => `【论文相关片段 ${i + 1}】:\n${item.chunk}`)
        .join("\n\n");
    } catch (e) {
      dump(`[PaperPilot] Error retrieving relevant context: ${e}\n`);
      return "";
    }
  }

  /**
   * Retrieves all document chunks for multi-stage synthesis/digest.
   */
  static async getDigestContext(attachmentID: number): Promise<string[]> {
    if (!attachmentID) return [];
    const doc = await this.getDocument(attachmentID);
    return doc.chunks;
  }

  /**
   * Clear cache for a specific attachment or all attachments.
   */
  static clearCache(attachmentID?: number): void {
    if (attachmentID) {
      this.cache.delete(attachmentID);
    } else {
      this.cache.clear();
    }
  }

  private static chunkText(text: string, chunkSize = 1800, overlap = 250): string[] {
    if (!text) return [];
    const clean = text.replace(/\r\n/g, "\n").trim();
    if (clean.length <= chunkSize) return [clean];

    const chunks: string[] = [];
    let start = 0;

    while (start < clean.length) {
      let end = start + chunkSize;
      if (end >= clean.length) {
        chunks.push(clean.substring(start).trim());
        break;
      }

      // Try to break at sentence or paragraph boundary near end
      const lookback = clean.substring(end - 150, end);
      const breakIdx = lookback.lastIndexOf("\n\n") !== -1
        ? end - 150 + lookback.lastIndexOf("\n\n") + 2
        : lookback.lastIndexOf(". ") !== -1
        ? end - 150 + lookback.lastIndexOf(". ") + 2
        : end;

      const actualEnd = breakIdx > start + 500 ? breakIdx : end;
      chunks.push(clean.substring(start, actualEnd).trim());
      start = actualEnd - overlap;
    }

    return chunks;
  }

  private static extractKeywords(text: string): string[] {
    if (!text) return [];
    const keywords: Set<string> = new Set();

    // English words (length >= 3)
    const enMatches = text.match(/[a-zA-Z]{3,}/g);
    if (enMatches) {
      const stopWords = new Set(["the", "and", "that", "this", "with", "from", "for", "are", "was", "were", "what", "which", "how"]);
      for (const w of enMatches) {
        const lower = w.toLowerCase();
        if (!stopWords.has(lower)) {
          keywords.add(lower);
        }
      }
    }

    // Chinese word segments (2-4 characters)
    const cnMatches = text.match(/[\u4e00-\u9fa5]{2,4}/g);
    if (cnMatches) {
      for (const w of cnMatches) {
        keywords.add(w);
      }
    }

    return Array.from(keywords);
  }

  private static escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
