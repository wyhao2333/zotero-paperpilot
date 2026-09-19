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

    try {
      dump("[PaperPilot] translation started (mymemory)\n");
      let data: any;

      if (typeof Zotero !== "undefined" && Zotero.HTTP?.request) {
        const xhr = await Zotero.HTTP.request("GET", url, {
          responseType: "json",
          timeout: 6000,
        });

        if (xhr && xhr.status >= 200 && xhr.status < 300) {
          data = xhr.response || (xhr.responseText ? JSON.parse(xhr.responseText) : null);
        } else {
          throw new Error(`HTTP ${xhr?.status || "unknown"}`);
        }
      } else {
        const response = await fetch(url, { method: "GET" });
        if (!response.ok) {
          throw new Error(`服务响应异常 (HTTP ${response.status})`);
        }
        data = await response.json();
      }

      if (data?.responseStatus && data.responseStatus !== 200 && data.responseStatus !== "200") {
        throw new Error(`MyMemory API 响应错误 (状态码 ${data.responseStatus}): ${data.responseDetails || ""}`);
      }

      const translatedText = data?.responseData?.translatedText;
      if (typeof translatedText === "string") {
        const upper = translatedText.toUpperCase();
        const knownErrors = [
          "QUERY LENGTH LIMIT EXCEEDED",
          "MAX ALLOWED QUERY",
          "INVALID SOURCE LANGUAGE",
          "INVALID TARGET LANGUAGE",
          "MYMEMORY WARNING",
          "PLEASE SELECT TWO DISTINCT LANGUAGES",
        ];
        for (const errSign of knownErrors) {
          if (upper.includes(errSign)) {
            throw new Error(`MyMemory 服务拒绝: ${translatedText}`);
          }
        }
        dump("[PaperPilot] translation completed (mymemory)\n");
        return translatedText;
      }
      throw new Error("接口返回数据格式异常");
    } catch (e: any) {
      throw new Error(`MyMemory 翻译失败: ${e.message || e}`);
    }
  }
}
