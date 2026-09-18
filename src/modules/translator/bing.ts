import { ITranslatorService, TranslateOptions } from "./types";

export class BingTranslator implements ITranslatorService {
  id = "bing";
  name = "Bing 免费翻译";

  async translate(text: string, options: TranslateOptions): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) return "";

    const targetLang = options.to === "zh-CN" ? "zh-Hans" : options.to;
    const url = "https://www.bing.com/ttranslatev3";

    const body = new URLSearchParams({
      fromLang: "auto-detect",
      text: trimmed,
      to: targetLang,
    });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
        body: body.toString(),
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data[0]?.translations?.[0]?.text) {
          return data[0].translations[0].text;
        }
      }
    } catch (e) {
      dump(`[PaperPilot] Bing translate fallback attempt: ${e}\n`);
    }

    // Fallback: Use GTX if Bing web endpoint is rate-limited
    const fallbackUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
      options.to || "zh-CN"
    )}&dt=t&q=${encodeURIComponent(trimmed)}`;
    const res = await fetch(fallbackUrl);
    const data = await res.json();
    return data[0].map((item: any) => item[0]).join("");
  }
}
