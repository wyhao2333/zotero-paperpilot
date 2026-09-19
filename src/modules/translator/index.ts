import { ITranslatorService, TranslateOptions } from "./types";
import { GoogleTranslator } from "./google";
import { BingTranslator } from "./bing";
import { AITranslator } from "./ai-translator";
import { MyMemoryTranslator } from "./mymemory";
import { YoudaoTranslator } from "./youdao";
import { PreferenceManager } from "../../core/preferences";

/**
 * Splits text into chunks respecting sentence and word boundaries.
 * Default max length: ~430 chars (under MyMemory's strict 500-character limit).
 */
export function splitTranslationText(text: string, maxLen = 430): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxLen) return [trimmed];

  const chunks: string[] = [];
  let remaining = trimmed;

  // Delimiters ordered by semantic priority
  const delimiters = [
    "\n\n",
    "\n",
    ". ",
    "? ",
    "! ",
    "。 ",
    "。",
    "？",
    "！",
    "; ",
    ";",
    "；",
    ", ",
    ",",
    "，",
    " ",
  ];

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining.trim());
      break;
    }

    let splitIdx = -1;

    for (const delim of delimiters) {
      const idx = remaining.lastIndexOf(delim, maxLen);
      // Ensure chunk doesn't become too tiny (at least 60 chars unless near end)
      if (idx !== -1 && idx >= 60) {
        splitIdx = idx + delim.length;
        break;
      }
    }

    // Fallback: any whitespace before maxLen
    if (splitIdx === -1) {
      const spaceIdx = remaining.lastIndexOf(" ", maxLen);
      if (spaceIdx > 0) {
        splitIdx = spaceIdx + 1;
      }
    }

    // Hard fallback: continuous string with no spaces
    if (splitIdx === -1 || splitIdx <= 0) {
      splitIdx = maxLen;
    }

    const chunk = remaining.substring(0, splitIdx).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    remaining = remaining.substring(splitIdx).trim();
  }

  return chunks;
}

export class TranslatorManager {
  private static services: Map<string, ITranslatorService> = new Map([
    ["mymemory", new MyMemoryTranslator()],
    ["google", new GoogleTranslator()],
    ["bing", new BingTranslator()],
    ["youdao", new YoudaoTranslator()],
    ["ai", new AITranslator()],
  ]);

  static getService(serviceId?: string): ITranslatorService {
    const id = serviceId || PreferenceManager.get().translationService || "mymemory";
    return this.services.get(id) || this.services.get("mymemory") || this.services.get("google")!;
  }

  /**
   * Generates a strictly deduplicated fallback chain based on the chosen primary service.
   */
  static getFallbackChain(primaryServiceId: string): string[] {
    const chainMap: Record<string, string[]> = {
      mymemory: ["mymemory", "google"],
      google: ["google", "mymemory"],
      bing: ["bing", "google", "mymemory"],
      youdao: ["youdao", "mymemory", "google"],
      ai: ["ai", "mymemory", "google"],
    };

    const rawList = chainMap[primaryServiceId] || [primaryServiceId, "mymemory", "google"];
    return Array.from(new Set(rawList));
  }

  /**
   * Translates text with automated chunking, deduplicated fallback chain, and progress callback.
   */
  static async translate(
    text: string,
    options?: Partial<TranslateOptions> & {
      onProgress?: (progressText: string, partialTranslation: string) => void;
    }
  ): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) return "";

    const prefs = PreferenceManager.get();
    const primaryId = prefs.translationService || "mymemory";
    const chain = this.getFallbackChain(primaryId);
    const to = options?.to || prefs.targetLanguage || "zh-CN";

    const chunks = splitTranslationText(trimmed, 430);
    if (chunks.length === 0) return "";

    let lastError: any = null;

    for (const serviceId of chain) {
      const service = this.getService(serviceId);
      if (!service) continue;

      try {
        dump(`[PaperPilot] Attempting translation via ${service.id} (${chunks.length} chunks)\n`);
        const translatedChunks: string[] = [];

        for (let i = 0; i < chunks.length; i++) {
          if (chunks.length > 1 && options?.onProgress) {
            const progressMsg = `正在翻译 ${i + 1} / ${chunks.length}...`;
            options.onProgress(progressMsg, translatedChunks.join("\n\n"));
          }

          const chunkResult = await service.translate(chunks[i], {
            from: options?.from,
            to,
            context: options?.context,
            attachmentID: options?.attachmentID,
          });

          if (!chunkResult || !chunkResult.trim()) {
            throw new Error(`服务 ${service.name} 返回空译文`);
          }

          translatedChunks.push(chunkResult.trim());
        }

        const fullTranslation = translatedChunks.join("\n\n");
        return fullTranslation;
      } catch (err: any) {
        dump(`[PaperPilot] Translation service ${service.id} failed: ${err.message || err}. Falling back...\n`);
        lastError = err;
      }
    }

    throw lastError || new Error("所有翻译服务均未成功响应");
  }
}
