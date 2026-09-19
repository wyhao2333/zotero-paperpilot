import { ITranslatorService, TranslateOptions } from "./types";
import { AIClient } from "../ai/client";
import { PreferenceManager } from "../../core/preferences";

export class AITranslator implements ITranslatorService {
  id = "ai";
  name = "AI 学术翻译 (LLM)";

  async translate(text: string, options: TranslateOptions): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) return "";

    const targetLang = options.to || PreferenceManager.get().targetLanguage || "zh-CN";

    const systemPrompt = `You are an expert academic translator specializing in scientific literature.
Translate the user's text into ${targetLang}.
Guidelines:
1. Ensure strict academic precision, natural fluency, and field-appropriate terminology.
2. Maintain any mathematical formulas (e.g., LaTeX), chemical equations, or citation markers verbatim.
3. Output ONLY the translated text without commentary, pleasantries, or explanations.`;

    let userContent = trimmed;
    const useContext = PreferenceManager.get().aiTranslationUseContext !== false;
    if (useContext && options.context && options.context.trim()) {
      userContent = `【参考上下文 (仅用于辅助理解专有名词、缩写与代词指代，无需翻译参考上下文)】:\n"""\n${options.context.trim()}\n"""\n\n【需要翻译的目标学术选段】:\n"""\n${trimmed}\n"""`;
    }

    return await AIClient.chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ]);
  }
}
