/**
 * PaperPilot Settings Script for Zotero Preferences Window
 */

(function () {
  function getZotero() {
    if (typeof Zotero !== "undefined") return Zotero;
    if (typeof window !== "undefined" && window.Zotero) return window.Zotero;
    try {
      return Components.classes["@zotero.org/Zotero;1"].getService(Components.interfaces.zoteroI);
    } catch (e) {}
    try {
      const Services = globalThis.Services || Components.classes["@mozilla.org/services/service;1"].getService(Components.interfaces.nsIServiceManager);
      return Services.wm.getMostRecentWindow("navigator:browser")?.Zotero;
    } catch (e) {}
    return null;
  }

  var defaultProviders = {
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
  };

  var PaperPilot_Preferences = {
    defaultProviders: defaultProviders,

    getPrefs() {
      try {
        const zotero = getZotero();
        if (zotero && zotero.Prefs) {
          const raw = zotero.Prefs.get("extensions.paperpilot.settings", true);
          if (raw) {
            const parsed = JSON.parse(raw);
            return {
              translationService: parsed.translationService || "mymemory",
              targetLanguage: parsed.targetLanguage || "zh-CN",
              autoTranslateSelection: !!parsed.autoTranslateSelection,
              selectedAIProvider: parsed.selectedAIProvider || "zhipu",
              aiProviders: {
                ...defaultProviders,
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
        translationService: "mymemory",
        targetLanguage: "zh-CN",
        autoTranslateSelection: false,
        selectedAIProvider: "zhipu",
        aiProviders: { ...defaultProviders },
        defaultDomain: "general",
        customPromptTemplate:
          "请结合上下文对以下内容进行深度学术解读，并解析关键术语：\n\n{text}",
      };
    },

    savePrefs(prefs) {
      try {
        const zotero = getZotero();
        if (zotero && zotero.Prefs) {
          zotero.Prefs.set(
            "extensions.paperpilot.settings",
            JSON.stringify(prefs),
            true
          );
          dump("[PaperPilot Prefs] Preferences saved successfully to Zotero.Prefs.\n");

          // Notify live plugin instance
          if (
            zotero.PaperPilot &&
            typeof zotero.PaperPilot.reloadPreferences === "function"
          ) {
            zotero.PaperPilot.reloadPreferences();
          }
          return true;
        } else {
          dump("[PaperPilot Prefs] Zotero.Prefs not accessible!\n");
        }
      } catch (e) {
        dump("[PaperPilot Prefs] Error saving preferences: " + e + "\n");
      }
      return false;
    },

    init(win) {
      dump("[PaperPilot Prefs] Initializing preferences pane...\n");
      const doc = win?.document || (typeof document !== "undefined" ? document : null);
      if (!doc) {
        dump("[PaperPilot Prefs] No document found, aborting init.\n");
        return;
      }

      const saveBtn = doc.getElementById("pp-pref-btn-save");
      if (!saveBtn) {
        dump("[PaperPilot Prefs] DOM not ready yet.\n");
        return;
      }

      if (saveBtn.dataset.ppInitialized === "true") {
        return; // Avoid double binding
      }
      saveBtn.dataset.ppInitialized = "true";

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
          defaultProviders[providerKey] ||
          defaultProviders.custom;
        if (apiKeyInput) apiKeyInput.value = cfg.apiKey || "";
        if (baseUrlInput) baseUrlInput.value = cfg.baseUrl || "";
        if (modelInput) modelInput.value = cfg.model || "";
      };

      syncProviderUI(prefs.selectedAIProvider);

      providerSelect?.addEventListener("change", () => {
        syncProviderUI(providerSelect.value);
      });

      saveBtn.addEventListener("click", () => {
        dump("[PaperPilot Prefs] Save button clicked!\n");
        const currentProviderKey = providerSelect ? providerSelect.value : "zhipu";
        const currentConfig =
          prefs.aiProviders[currentProviderKey] || {
            ...defaultProviders[currentProviderKey],
          };

        if (apiKeyInput) currentConfig.apiKey = apiKeyInput.value.trim();
        if (baseUrlInput) currentConfig.baseUrl = baseUrlInput.value.trim();
        if (modelInput) currentConfig.model = modelInput.value.trim();

        prefs.aiProviders[currentProviderKey] = currentConfig;
        prefs.selectedAIProvider = currentProviderKey;
        if (transSelect) prefs.translationService = transSelect.value;
        if (targetLangSelect) prefs.targetLanguage = targetLangSelect.value;
        if (autoTransCb) prefs.autoTranslateSelection = autoTransCb.checked;
        if (domainSelect) prefs.defaultDomain = domainSelect.value;
        if (customPromptArea) prefs.customPromptTemplate = customPromptArea.value;

        const success = PaperPilot_Preferences.savePrefs(prefs);

        if (saveStatusLabel) {
          saveStatusLabel.textContent = success
            ? "✅ 配置已成功保存并实时生效！"
            : "❌ 保存失败，请检查控制台";
          saveStatusLabel.style.color = success ? "#16a34a" : "#dc2626";
          saveStatusLabel.style.display = "inline";
          setTimeout(() => {
            saveStatusLabel.style.display = "none";
          }, 3500);
        }
      });

      testBtn?.addEventListener("click", async () => {
        if (testResultLabel) {
          testResultLabel.textContent = "⏳ 正在测试连接...";
          testResultLabel.style.color = "#2563eb";
        }

        const apiKey = apiKeyInput ? apiKeyInput.value.trim() : "";
        const baseUrl = (baseUrlInput ? baseUrlInput.value.trim() : "").replace(/\/+$/, "");
        const model = modelInput ? modelInput.value.trim() : "";

        if (!apiKey && providerSelect?.value !== "ollama") {
          if (testResultLabel) {
            testResultLabel.textContent = "❌ 请先填写对应服务商的 API Key";
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
              testResultLabel.textContent = "✅ 连接成功！API 正常响应 (HTTP 200)";
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
            testResultLabel.textContent = `❌ 网络连接异常: ${err.message || err}`;
            testResultLabel.style.color = "#dc2626";
          }
        }
      });

      dump("[PaperPilot Prefs] Event listeners attached successfully.\n");
    },
  };

  // Expose to all scopes
  if (typeof window !== "undefined") {
    window.PaperPilot_Preferences = PaperPilot_Preferences;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.PaperPilot_Preferences = PaperPilot_Preferences;
  }
  const z = getZotero();
  if (z) {
    if (!z.PaperPilot) z.PaperPilot = {};
    z.PaperPilot.Preferences = PaperPilot_Preferences;
    z.PaperPilot.onPrefsLoad = function (win) {
      PaperPilot_Preferences.init(win || (typeof window !== "undefined" ? window : null));
    };
  }

  // Auto-init watcher
  function autoInit(retryCount) {
    const win = typeof window !== "undefined" ? window : globalThis;
    const doc = win?.document || (typeof document !== "undefined" ? document : null);
    if (!doc) return;

    const saveBtn = doc.getElementById("pp-pref-btn-save");
    if (saveBtn) {
      PaperPilot_Preferences.init(win);
    } else if (retryCount < 40) {
      setTimeout(() => autoInit(retryCount + 1), 80);
    }
  }

  if (typeof window !== "undefined") {
    if (window.document && window.document.readyState === "complete") {
      autoInit(0);
    } else if (window.addEventListener) {
      window.addEventListener("DOMContentLoaded", () => autoInit(0));
      window.addEventListener("load", () => autoInit(0));
      setTimeout(() => autoInit(0), 100);
    }
  }
})();
