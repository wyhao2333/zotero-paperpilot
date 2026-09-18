import { ITranslatorService, TranslateOptions } from "./types";
import { MyMemoryTranslator } from "./mymemory";

export class GoogleTranslator implements ITranslatorService {
  id = "google";
  name = "Google 免费翻译 (GTX)";

  async translate(text: string, options: TranslateOptions): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) return "";

    const targetLang = options.to || "zh-CN";
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
      targetLang
    )}&dt=t&q=${encodeURIComponent(trimmed)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && Array.isArray(data[0])) {
          const translatedParts = data[0].map((item: any) => (item && item[0] ? item[0] : ""));
          const result = translatedParts.join("").trim();
          if (result) return result;
        }
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      dump(`[PaperPilot] Google translate timed out or failed (${e.message || e}), falling back to MyMemory...\n`);
    }

    // Seamless fallback to MyMemory translator
    const myMemory = new MyMemoryTranslator();
    return await myMemory.translate(text, options);
  }
}
