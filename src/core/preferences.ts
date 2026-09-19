import { AIProviderConfig, DomainType } from "../types/zotero";
import { EventBus } from "./event-bus";

export type TranslationServiceType = "mymemory" | "google" | "bing" | "youdao" | "ai";
export type DigestStrategyType = "auto" | "single-pass" | "map-reduce";

export interface PluginPreferences {
  translationService: TranslationServiceType;
  targetLanguage: string;
  autoTranslateSelection: boolean;
  selectedAIProvider: string;
  aiProviders: Record<string, AIProviderConfig>;
  defaultDomain: DomainType;
  customPromptTemplate: string;
  interpretationPromptOverrides?: Partial<Record<DomainType, string>>;
  digestStrategy: DigestStrategyType;
  digestConcurrency: number;
  digestSinglePassMaxChars: number;
  aiTranslationUseContext: boolean;
}

export const DEFAULT_AI_PROVIDERS: Record<string, AIProviderConfig> = {
  zhipu: {
    id: "zhipu",
    name: "智谱清言 (GLM)",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiKey: "",
    model: "glm-4-flash",
    temperature: 0.3,
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "",
    model: "deepseek-chat",
    temperature: 0.3,
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
    temperature: 0.3,
  },
  moonshot: {
    id: "moonshot",
    name: "Moonshot (Kimi)",
    baseUrl: "https://api.moonshot.cn/v1",
    apiKey: "",
    model: "moonshot-v1-8k",
    temperature: 0.3,
  },
  qwen: {
    id: "qwen",
    name: "通义千问 (Qwen)",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKey: "",
    model: "qwen-plus",
    temperature: 0.3,
  },
  siliconflow: {
    id: "siliconflow",
    name: "硅基流动 (SiliconFlow)",
    baseUrl: "https://api.siliconflow.cn/v1",
    apiKey: "",
    model: "deepseek-ai/DeepSeek-V3",
    temperature: 0.3,
  },
  ollama: {
    id: "ollama",
    name: "本地 Ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    apiKey: "ollama",
    model: "llama3",
    temperature: 0.3,
  },
  custom: {
    id: "custom",
    name: "自定义 API 接口",
    baseUrl: "https://your-custom-endpoint.com/v1",
    apiKey: "",
    model: "custom-model",
    temperature: 0.3,
    customHeaders: {},
  },
};

export const DEFAULT_PREFS: PluginPreferences = {
  translationService: "mymemory",
  targetLanguage: "zh-CN",
  autoTranslateSelection: false,
  selectedAIProvider: "zhipu",
  aiProviders: DEFAULT_AI_PROVIDERS,
  defaultDomain: "general",
  customPromptTemplate: "请结合上下文对以下内容进行深度学术解读，并解析关键术语：\n\n{text}",
  interpretationPromptOverrides: {},
  digestStrategy: "auto",
  digestConcurrency: 4,
  digestSinglePassMaxChars: 48000,
  aiTranslationUseContext: true,
};

export class PreferenceManager {
  private static readonly PREF_KEY = "extensions.paperpilot.settings";
  private static cachedPrefs: PluginPreferences = { ...DEFAULT_PREFS };
  private static observerSymbol: string | null = null;

  static init(): void {
    try {
      if (typeof Zotero !== "undefined" && Zotero.Prefs) {
        const raw = Zotero.Prefs.get(this.PREF_KEY, true);
        if (raw) {
          const parsed = JSON.parse(raw);
          this.cachedPrefs = {
            ...DEFAULT_PREFS,
            ...parsed,
            interpretationPromptOverrides: {
              ...(DEFAULT_PREFS.interpretationPromptOverrides || {}),
              ...(parsed.interpretationPromptOverrides || {}),
            },
            aiProviders: {
              ...DEFAULT_AI_PROVIDERS,
              ...(parsed.aiProviders || {}),
            },
          };
          dump("[PaperPilot] PreferenceManager loaded prefs from Zotero.Prefs\n");
        }
      }
    } catch (e) {
      dump(`[PaperPilot] Failed to load preferences: ${e}\n`);
    }
  }

  static registerObserver(): void {
    if (this.observerSymbol) return;
    try {
      if (typeof Zotero !== "undefined" && Zotero.Prefs?.registerObserver) {
        this.observerSymbol = Zotero.Prefs.registerObserver(
          this.PREF_KEY,
          () => {
            dump("[PaperPilot] Prefs observer triggered -> reinitializing prefs\n");
            this.init();
            EventBus.emit("preferences:changed");
          },
          true
        );
      }
    } catch (e) {
      dump(`[PaperPilot] Failed to register prefs observer: ${e}\n`);
    }
  }

  static unregisterObserver(): void {
    if (!this.observerSymbol) return;
    try {
      if (typeof Zotero !== "undefined" && Zotero.Prefs?.unregisterObserver) {
        Zotero.Prefs.unregisterObserver(this.observerSymbol);
        this.observerSymbol = null;
      }
    } catch (e) {
      dump(`[PaperPilot] Failed to unregister prefs observer: ${e}\n`);
    }
  }

  static get(): PluginPreferences {
    return this.cachedPrefs;
  }

  static set(newPrefs: Partial<PluginPreferences>): void {
    this.cachedPrefs = {
      ...this.cachedPrefs,
      ...newPrefs,
    };
    let savedToZotero = false;
    try {
      if (typeof Zotero !== "undefined" && Zotero.Prefs) {
        Zotero.Prefs.set(this.PREF_KEY, JSON.stringify(this.cachedPrefs), true);
        savedToZotero = true;
        dump("[PaperPilot] PreferenceManager saved prefs to Zotero.Prefs\n");
      }
    } catch (e) {
      dump(`[PaperPilot] Failed to save preferences: ${e}\n`);
    }
    // Avoid double-emitting preferences:changed when Zotero.Prefs observer is active
    if (!this.observerSymbol || !savedToZotero) {
      EventBus.emit("preferences:changed");
    }
  }

  static getActiveAIConfig(): AIProviderConfig {
    const prefs = this.get();
    const providerKey = prefs.selectedAIProvider || "zhipu";
    return prefs.aiProviders[providerKey] || DEFAULT_AI_PROVIDERS[providerKey] || DEFAULT_AI_PROVIDERS.custom;
  }
}
