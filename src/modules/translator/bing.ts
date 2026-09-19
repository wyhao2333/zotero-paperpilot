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

    const bodyStr = `fromLang=auto-detect&text=${encodeURIComponent(trimmed)}&to=${encodeURIComponent(targetLang)}`;

    try {
      dump("[PaperPilot] translation started (bing)\n");
      let data: any;

      if (typeof Zotero !== "undefined" && Zotero.HTTP?.request) {
        const xhr = await Zotero.HTTP.request("POST", url, {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          },
          body: bodyStr,
          responseType: "json",
          timeout: 4000,
        });

        if (xhr && xhr.status >= 200 && xhr.status < 300) {
          data = xhr.response || (xhr.responseText ? JSON.parse(xhr.responseText) : null);
        }
      } else {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          },
          body: bodyStr,
        });
        if (response.ok) {
          data = await response.json();
        }
      }

      if (Array.isArray(data) && data[0]?.translations?.[0]?.text) {
        dump("[PaperPilot] translation completed (bing)\n");
        return data[0].translations[0].text;
      }
    } catch (e: any) {
      dump(`[PaperPilot] Bing translate fallback attempt: ${e.message || e}\n`);
    }

    // Fallback: Use MyMemory if Bing web endpoint is unreachable or requires token
    const myMemory = new MyMemoryTranslator();
    return await myMemory.translate(text, options);
  }
}
