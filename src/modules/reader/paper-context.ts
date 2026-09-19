export interface PaperDocumentContext {
  attachmentID: number;
  text: string;
  chunks: string[];
  extractedPages: number;
  totalPages: number;
}

export interface NormalizedWithIndexMap {
  normalized: string;
  indexMap: number[];
}

export function normalizeWithIndexMap(text: string): NormalizedWithIndexMap {
  if (!text) return { normalized: "", indexMap: [] };
  const indexMap: number[] = [];
  let normalized = "";
  let inWhitespace = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (!inWhitespace) {
        if (normalized.length > 0) {
          normalized += " ";
          indexMap.push(i);
        }
        inWhitespace = true;
      }
    } else {
      inWhitespace = false;
      normalized += ch;
      indexMap.push(i);
    }
  }

  return { normalized, indexMap };
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
   * Detects whether user question has full-paper exploration intent.
   */
  static hasFullPaperIntent(question: string): boolean {
    if (!question) return false;
    const lower = question.toLowerCase();
    const fullPaperKeywords = [
      "全文",
      "全篇",
      "整篇",
      "全书",
      "整篇论文",
      "整篇文章",
      "全篇文献",
      "本文主要",
      "本文讲了什么",
      "总体",
      "总结全文",
      "整体架构",
      "文章大意",
      "主要贡献",
      "核心创新",
      "全篇讲了",
      "文章总体",
      "overall",
      "entire paper",
      "whole paper",
      "full paper",
      "throughout the paper",
      "main contribution",
      "summary of the paper",
      "paper as a whole",
    ];
    return fullPaperKeywords.some((kw) => lower.includes(kw));
  }

  /**
   * Extracts local selection context (surrounding paragraph/passage) from document text.
   */
  static getLocalSelectionContext(doc: PaperDocumentContext, selectedText: string): string {
    if (!doc || !selectedText) return "";
    const cleanSel = selectedText.trim().replace(/\s+/g, " ");
    const sample = cleanSel.length > 40 ? cleanSel.substring(0, 40) : cleanSel;

    // Search in full text using index mapping
    const { normalized, indexMap } = normalizeWithIndexMap(doc.text);
    const lowerNorm = normalized.toLowerCase();
    const lowerSample = sample.toLowerCase();
    const normIdx = lowerNorm.indexOf(lowerSample);

    if (normIdx !== -1 && indexMap.length > 0) {
      const normEndIdx = Math.min(indexMap.length - 1, normIdx + lowerSample.length - 1);
      const origStart = indexMap[normIdx];
      const origEnd = indexMap[normEndIdx] + 1;

      const start = Math.max(0, origStart - 600);
      const end = Math.min(doc.text.length, origEnd + 800);
      const excerpt = doc.text.substring(start, end).trim();
      return `【所选引文在论文中的所在段落与局部上下文】:\n"""\n...${excerpt}...\n"""`;
    }

    // Fallback: search in chunks
    const matchingChunk = doc.chunks.find((c) =>
      c.toLowerCase().replace(/\s+/g, " ").includes(lowerSample)
    );
    if (matchingChunk) {
      return `【所选引文在论文中的所在段落与局部上下文】:\n"""\n${matchingChunk}\n"""`;
    }

    return doc.chunks[0] ? `【所选引文附近上下文】:\n"""\n${doc.chunks[0]}\n"""` : "";
  }

  /**
   * Full-paper keyword scoring and retrieval across all document chunks.
   */
  static getFullPaperContext(
    doc: PaperDocumentContext,
    question: string,
    selectedText?: string
  ): string {
    if (!doc || !doc.chunks.length) return "";

    if (doc.chunks.length <= 5) {
      return doc.chunks.map((c, i) => `【论文片段 ${i + 1}】:\n${c}`).join("\n\n");
    }

    const keywords = this.extractKeywords(`${question} ${selectedText || ""}`);
    const scored = doc.chunks.map((chunk, index) => {
      let score = 0;
      const lowerChunk = chunk.toLowerCase();

      for (const kw of keywords) {
        const occurrences = (lowerChunk.match(new RegExp(this.escapeRegExp(kw), "g")) || []).length;
        score += occurrences;
      }

      if (selectedText && selectedText.length > 10) {
        const sample = selectedText.slice(0, 30).toLowerCase();
        if (lowerChunk.includes(sample)) {
          score += 10;
        }
      }

      return { index, chunk, score };
    });

    const topPicks = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .sort((a, b) => a.index - b.index);

    return topPicks.map((item, i) => `【论文相关片段 ${i + 1}】:\n${item.chunk}`).join("\n\n");
  }

  /**
   * Retrieves relevant context based on intent:
   * - quote present + normal question -> local selection context only (prevents over-retrieval)
   * - quote present + full-paper intent -> full-paper retrieval
   * - no quote -> full-paper retrieval
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

      const cleanQuote = selectedText ? selectedText.trim() : "";

      // Branch 1: Quote is present and normal question (no full-paper intent)
      if (cleanQuote && !this.hasFullPaperIntent(question)) {
        return this.getLocalSelectionContext(doc, cleanQuote);
      }

      // Branch 2: Full-paper intent or no quote
      return this.getFullPaperContext(doc, question, cleanQuote);
    } catch (e) {
      dump(`[PaperPilot] Error retrieving relevant context: ${e}\n`);
      return "";
    }
  }

  /**
   * Retrieves concise local context (~300 chars before/after) for AI translation.
   */
  static async getTranslationContext(attachmentID: number, selectedText: string): Promise<string> {
    if (!attachmentID || !selectedText) return "";
    try {
      const doc = await this.getDocument(attachmentID);
      if (!doc || !doc.text) return "";
      const cleanSel = selectedText.trim().replace(/\s+/g, " ");
      const sample = cleanSel.length > 30 ? cleanSel.substring(0, 30) : cleanSel;

      const { normalized, indexMap } = normalizeWithIndexMap(doc.text);
      const lowerNorm = normalized.toLowerCase();
      const lowerSample = sample.toLowerCase();
      const normIdx = lowerNorm.indexOf(lowerSample);

      if (normIdx !== -1 && indexMap.length > 0) {
        const normEndIdx = Math.min(indexMap.length - 1, normIdx + lowerSample.length - 1);
        const origStart = indexMap[normIdx];
        const origEnd = indexMap[normEndIdx] + 1;

        const start = Math.max(0, origStart - 300);
        const end = Math.min(doc.text.length, origEnd + 300);
        return doc.text.substring(start, end).trim();
      }
    } catch (e) {
      dump(`[PaperPilot] Error getting translation context: ${e}\n`);
    }
    return "";
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
