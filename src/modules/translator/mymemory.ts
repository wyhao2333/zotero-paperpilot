import { ITranslatorService, TranslateOptions } from "./types";

export class MyMemoryTranslator implements ITranslatorService {
  id = "mymemory";
  name = "MyMemory 免费翻译 (国内直连免 Key)";

  async translate(text: string, options: TranslateOptions): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) return "";

    const from = options.from || "en";
    const to = options.to || "zh-CN";
    const langPair = `${from}|${to}`;

    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      trimmed
    )}&langpair=${encodeURIComponent(langPair)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`MyMemory HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data?.responseData?.translatedText) {
        return data.responseData.translatedText;
      }
      throw new Error("Invalid response from MyMemory");
    } catch (e: any) {
      clearTimeout(timeoutId);
      throw e;
    }
  }
}
