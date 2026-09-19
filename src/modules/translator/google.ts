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

    try {
      dump("[PaperPilot] translation started (google)\n");
      let data: any;

      if (typeof Zotero !== "undefined" && Zotero.HTTP?.request) {
        const xhr = await Zotero.HTTP.request("GET", url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          },
          responseType: "json",
          timeout: 4000,
        });

        if (xhr && xhr.status >= 200 && xhr.status < 300) {
          data = xhr.response || (xhr.responseText ? JSON.parse(xhr.responseText) : null);
        } else {
          throw new Error(`HTTP ${xhr?.status || "unknown"}`);
        }
      } else {
        const response = await fetch(url, {
          method: "GET",
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        });
        if (response.ok) {
          data = await response.json();
        }
      }

      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translatedParts = data[0].map((item: any) => (item && item[0] ? item[0] : ""));
        const result = translatedParts.join("").trim();
        if (result) {
          dump("[PaperPilot] translation completed (google)\n");
          return result;
        }
      }
    } catch (e: any) {
      dump(`[PaperPilot] Google translate timed out or failed (${e.message || e}), falling back to MyMemory...\n`);
    }

    // Seamless fallback to MyMemory translator
    const myMemory = new MyMemoryTranslator();
    return await myMemory.translate(text, options);
  }
}
