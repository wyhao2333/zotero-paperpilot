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
Translate the user's target text into ${targetLang}.
Guidelines:
1. Ensure strict academic precision, natural fluency, and field-appropriate terminology.
2. If background context is provided, it is solely for terminology disambiguation and pronoun resolution. NEVER translate the background context.
3. Translate ONLY the designated TARGET text chunk.
4. Maintain any mathematical formulas (e.g., LaTeX), chemical equations, or citation markers verbatim.
5. Output ONLY the translated target text without commentary, pleasantries, or explanations.`;

    let userContent = trimmed;
    const useContext = PreferenceManager.get().aiTranslationUseContext !== false;
    if (useContext && options.context && options.context.trim()) {
      const cleanContext = options.context.trim().slice(0, 1200);
      userContent = `【BACKGROUND CONTEXT (Reference only for term disambiguation, DO NOT translate)】:\n"""\n${cleanContext}\n"""\n\n【TARGET TEXT TO TRANSLATE】:\n"""\n${trimmed}\n"""`;
    }

    return await AIClient.chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ]);
  }
}
