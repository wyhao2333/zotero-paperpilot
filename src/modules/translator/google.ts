import { ITranslatorService, TranslateOptions } from "./types";

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

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });

    if (!response.ok) {
      throw new Error(`Google Translate failed with HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      throw new Error("Invalid response format from Google Translate");
    }

    const translatedParts = data[0].map((item: any) => (item && item[0] ? item[0] : ""));
    return translatedParts.join("").trim();
  }
}
