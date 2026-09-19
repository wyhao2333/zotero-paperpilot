import { ITranslatorService, TranslateOptions } from "./types";

export class YoudaoTranslator implements ITranslatorService {
  id = "youdao";
  name = "有道词典 (国内免 Key 词汇短语)";

  async translate(text: string, options: TranslateOptions): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) return "";

    const url = `https://dict.youdao.com/suggest?num=1&doctype=json&q=${encodeURIComponent(
      trimmed
    )}`;

    try {
      dump("[PaperPilot] translation started (youdao)\n");
      let data: any;

      if (typeof Zotero !== "undefined" && Zotero.HTTP?.request) {
        const xhr = await Zotero.HTTP.request("GET", url, {
          responseType: "json",
          timeout: 4000,
        });

        if (xhr && xhr.status >= 200 && xhr.status < 300) {
          data = xhr.response || (xhr.responseText ? JSON.parse(xhr.responseText) : null);
        }
      } else {
        const response = await fetch(url, { method: "GET" });
        if (response.ok) {
          data = await response.json();
        }
      }

      const entry = data?.data?.entries?.[0];
      if (entry && entry.explain) {
        dump("[PaperPilot] translation completed (youdao)\n");
        return `${entry.entry}: ${entry.explain}`;
      }
      throw new Error("No dictionary match found");
    } catch (e: any) {
      throw e;
    }
  }
}
