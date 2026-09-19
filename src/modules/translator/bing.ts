import { ITranslatorService, TranslateOptions } from "./types";
import { MyMemoryTranslator } from "./mymemory";

export class BingTranslator implements ITranslatorService {
  id = "bing";
  name = "Bing 免费翻译";

  async translate(text: string, options: TranslateOptions): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) return "";

    const targetLang = options.to === "zh-CN" ? "zh-Hans" : options.to || "zh-Hans";
    const url = "https://www.bing.com/ttranslatev3";

    const body = new URLSearchParams({
      fromLang: "auto-detect",
      text: trimmed,
      to: targetLang,
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
        body: body.toString(),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data[0]?.translations?.[0]?.text) {
          return data[0].translations[0].text;
        }
      }
    } catch (e: any) {
      dump(`[PaperPilot] Bing translate fallback attempt: ${e.message || e}\n`);
    }

    // Fallback: Use MyMemory if Bing web endpoint is unreachable or requires token
    const myMemory = new MyMemoryTranslator();
    return await myMemory.translate(text, options);
  }
}
