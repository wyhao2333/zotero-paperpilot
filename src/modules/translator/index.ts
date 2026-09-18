import { ITranslatorService, TranslateOptions } from "./types";
import { GoogleTranslator } from "./google";
import { BingTranslator } from "./bing";
import { AITranslator } from "./ai-translator";
import { MyMemoryTranslator } from "./mymemory";
import { YoudaoTranslator } from "./youdao";
import { PreferenceManager } from "../../core/preferences";

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

  static async translate(text: string, options?: Partial<TranslateOptions>): Promise<string> {
    const prefs = PreferenceManager.get();
    const service = this.getService(prefs.translationService);
    const to = options?.to || prefs.targetLanguage || "zh-CN";

    try {
      return await service.translate(text, {
        from: options?.from,
        to,
      });
    } catch (err: any) {
      dump(`[PaperPilot] Primary translation service failed: ${err.message || err}. Falling back to MyMemory...\n`);
      const fallback = new MyMemoryTranslator();
      return await fallback.translate(text, {
        from: options?.from,
        to,
      });
    }
  }
}
