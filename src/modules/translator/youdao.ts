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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const entry = data?.data?.entries?.[0];
        if (entry && entry.explain) {
          return `${entry.entry}: ${entry.explain}`;
        }
      }
      throw new Error("No dictionary match found");
    } catch (e: any) {
      clearTimeout(timeoutId);
      throw e;
    }
  }
}
