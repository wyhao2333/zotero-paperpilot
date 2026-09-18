/**
 * PaperPilot Settings Script for Zotero Preferences Window
 */

/* global Zotero */

var PaperPilot_Preferences = {
  defaultProviders: {
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
      name: "OpenAI (ChatGPT)",
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
    },
  },

  getPrefs() {
    try {
      if (typeof Zotero !== "undefined" && Zotero.Prefs) {
        const raw = Zotero.Prefs.get("extensions.paperpilot.settings", true);
        if (raw) {
          const parsed = JSON.parse(raw);
          return {
            translationService: parsed.translationService || "google",
            targetLanguage: parsed.targetLanguage || "zh-CN",
            autoTranslateSelection: !!parsed.autoTranslateSelection,
            selectedAIProvider: parsed.selectedAIProvider || "zhipu",
            aiProviders: {
              ...this.defaultProviders,
              ...(parsed.aiProviders || {}),
            },
            defaultDomain: parsed.defaultDomain || "general",
            customPromptTemplate:
              parsed.customPromptTemplate ||
              "请结合上下文对以下内容进行深度学术解读，并解析关键术语：\n\n{text}",
          };
        }
      }
    } catch (e) {
      dump("[PaperPilot Prefs] Error reading preferences: " + e + "\n");
    }
    return {
      translationService: "google",
      targetLanguage: "zh-CN",
      autoTranslateSelection: false,
      selectedAIProvider: "zhipu",
      aiProviders: { ...this.defaultProviders },
      defaultDomain: "general",
      customPromptTemplate:
        "请结合上下文对以下内容进行深度学术解读，并解析关键术语：\n\n{text}",
    };
  },

  savePrefs(prefs) {
    try {
      if (typeof Zotero !== "undefined" && Zotero.Prefs) {
        Zotero.Prefs.set(
          "extensions.paperpilot.settings",
          JSON.stringify(prefs),
          true
        );
      }
    } catch (e) {
      dump("[PaperPilot Prefs] Error saving preferences: " + e + "\n");
    }
  },

  init(win) {
    const doc = win.document;
    if (!doc) return;

    let prefs = this.getPrefs();

    const transSelect = doc.getElementById("pp-pref-trans-service");
    const targetLangSelect = doc.getElementById("pp-pref-target-lang");
    const autoTransCb = doc.getElementById("pp-pref-auto-translate");
    const providerSelect = doc.getElementById("pp-pref-ai-provider");
    const apiKeyInput = doc.getElementById("pp-pref-api-key");
    const baseUrlInput = doc.getElementById("pp-pref-base-url");
    const modelInput = doc.getElementById("pp-pref-model");
    const domainSelect = doc.getElementById("pp-pref-default-domain");
    const customPromptArea = doc.getElementById("pp-pref-custom-prompt");
    const saveBtn = doc.getElementById("pp-pref-btn-save");
    const testBtn = doc.getElementById("pp-pref-btn-test");
    const testResultLabel = doc.getElementById("pp-pref-test-result");
    const saveStatusLabel = doc.getElementById("pp-pref-save-status");

    if (transSelect) transSelect.value = prefs.translationService;
    if (targetLangSelect) targetLangSelect.value = prefs.targetLanguage;
    if (autoTransCb) autoTransCb.checked = prefs.autoTranslateSelection;
    if (providerSelect) providerSelect.value = prefs.selectedAIProvider;
    if (domainSelect) domainSelect.value = prefs.defaultDomain;
    if (customPromptArea) customPromptArea.value = prefs.customPromptTemplate;

    const syncProviderUI = (providerKey) => {
      const cfg =
        prefs.aiProviders[providerKey] ||
        this.defaultProviders[providerKey] ||
        this.defaultProviders.custom;
      if (apiKeyInput) apiKeyInput.value = cfg.apiKey || "";
      if (baseUrlInput) baseUrlInput.value = cfg.baseUrl || "";
      if (modelInput) modelInput.value = cfg.model || "";
    };

    syncProviderUI(prefs.selectedAIProvider);

    providerSelect?.addEventListener("change", () => {
      syncProviderUI(providerSelect.value);
    });

    saveBtn?.addEventListener("click", () => {
      const currentProviderKey = providerSelect.value;
      const currentConfig =
        prefs.aiProviders[currentProviderKey] || {
          ...this.defaultProviders[currentProviderKey],
        };

      currentConfig.apiKey = apiKeyInput.value.trim();
      currentConfig.baseUrl = baseUrlInput.value.trim();
      currentConfig.model = modelInput.value.trim();

      prefs.aiProviders[currentProviderKey] = currentConfig;
      prefs.selectedAIProvider = currentProviderKey;
      prefs.translationService = transSelect.value;
      prefs.targetLanguage = targetLangSelect.value;
      prefs.autoTranslateSelection = autoTransCb.checked;
      prefs.defaultDomain = domainSelect.value;
      prefs.customPromptTemplate = customPromptArea.value;

      this.savePrefs(prefs);

      if (saveStatusLabel) {
        saveStatusLabel.style.display = "inline";
        setTimeout(() => {
          saveStatusLabel.style.display = "none";
        }, 2500);
      }
    });

    testBtn?.addEventListener("click", async () => {
      if (testResultLabel) {
        testResultLabel.textContent = "⏳ 正在测试连接...";
        testResultLabel.style.color = "#2563eb";
      }

      const apiKey = apiKeyInput.value.trim();
      const baseUrl = baseUrlInput.value.trim().replace(/\/+$/, "");
      const model = modelInput.value.trim();

      if (!apiKey && providerSelect.value !== "ollama") {
        if (testResultLabel) {
          testResultLabel.textContent = "❌ 请先填写 API Key";
          testResultLabel.style.color = "#dc2626";
        }
        return;
      }

      try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 5,
          }),
        });

        if (res.ok) {
          if (testResultLabel) {
            testResultLabel.textContent = "✅ 连接成功！API 正常响应";
            testResultLabel.style.color = "#16a34a";
          }
        } else {
          const errTxt = await res.text().catch(() => "");
          if (testResultLabel) {
            testResultLabel.textContent = `❌ 请求失败 (HTTP ${res.status}): ${errTxt.slice(0, 100)}`;
            testResultLabel.style.color = "#dc2626";
          }
        }
      } catch (err) {
        if (testResultLabel) {
          testResultLabel.textContent = `❌ 网络异常: ${err.message || err}`;
          testResultLabel.style.color = "#dc2626";
        }
      }
    });
  },
};
