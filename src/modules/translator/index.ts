import { ITranslatorService, TranslateOptions } from "./types";
import { GoogleTranslator } from "./google";
import { BingTranslator } from "./bing";
import { AITranslator } from "./ai-translator";
import { PreferenceManager } from "../../core/preferences";

export class TranslatorManager {
  private static services: Map<string, ITranslatorService> = new Map([
    ["google", new GoogleTranslator()],
    ["bing", new BingTranslator()],
    ["ai", new AITranslator()],
  ]);

  static getService(serviceId?: string): ITranslatorService {
    const id = serviceId || PreferenceManager.get().translationService || "google";
    return this.services.get(id) || this.services.get("google")!;
  }

  static async translate(text: string, options?: Partial<TranslateOptions>): Promise<string> {
    const prefs = PreferenceManager.get();
    const service = this.getService(prefs.translationService);
    const to = options?.to || prefs.targetLanguage || "zh-CN";

    return await service.translate(text, {
      from: options?.from,
      to,
    });
  }
}
