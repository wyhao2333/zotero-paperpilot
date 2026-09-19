import { ITranslatorService, TranslateOptions } from "./types";

export class MyMemoryTranslator implements ITranslatorService {
  id = "mymemory";
  name = "MyMemory 免费翻译 (国内直连免 Key)";

  async translate(text: string, options: TranslateOptions): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) return "";

    const requestedTo = options.to || "zh-CN";

    // Detect if selection is already predominantly Chinese
    const containsChinese = /[\u4e00-\u9fa5]/.test(trimmed);
    let targetLang = requestedTo;

    // Prevent MyMemory error "PLEASE SELECT TWO DISTINCT LANGUAGES" if user selected Chinese text
    if (containsChinese && (requestedTo === "zh-CN" || requestedTo === "zh-TW" || requestedTo === "zh")) {
      targetLang = "en";
    }

    const fromLang = options.from || "autodetect";
    const langPair = `${fromLang}|${targetLang}`;

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
        throw new Error(`服务响应异常 (HTTP ${response.status})`);
      }

      const data = await response.json();
      if (data?.responseData?.translatedText) {
        return data.responseData.translatedText;
      }
      throw new Error("接口返回数据格式异常");
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === "AbortError") {
        throw new Error("MyMemory 翻译网络请求超时 (6s)");
      }
      throw new Error(`MyMemory 翻译失败: ${e.message || e}`);
    }
  }
}
