/**
 * PaperPilot Settings Script for Zotero Preferences Window
 */

(function () {
  function getZotero() {
    if (typeof Zotero !== "undefined") return Zotero;
    if (typeof window !== "undefined" && window.Zotero) return window.Zotero;
    dump("[PaperPilot Prefs] Error: Zotero global not found in preferences context\n");
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
              interpretationPromptOverrides:
                parsed.interpretationPromptOverrides || {},
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
        interpretationPromptOverrides: {},
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
          return true;
        }
      } catch (e) {
        dump("[PaperPilot Prefs] Error saving preferences: " + e + "\n");
      }
      return false;
    },

    init(win) {
      dump("[PaperPilot Prefs] pane load event\n");
      const doc = win?.document || (typeof document !== "undefined" ? document : null);
      if (!doc) {
        dump("[PaperPilot Prefs] ERROR: No document found for init.\n");
        return;
      }

      const saveBtn = doc.getElementById("pp-pref-btn-save");
      if (!saveBtn) {
        dump("[PaperPilot Prefs] ERROR: Save button #pp-pref-btn-save not found in document\n");
        return;
      }

      // Guard against double binding
      if (saveBtn.dataset.ppInitialized === "true") {
        return;
      }
      saveBtn.dataset.ppInitialized = "true";

      dump("[PaperPilot Prefs] controls found\n");

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
      const promptWarningLabel = doc.getElementById("pp-pref-prompt-warning");
      const resetDomainPromptBtn = doc.getElementById("pp-pref-btn-reset-domain-prompt");
      const testBtn = doc.getElementById("pp-pref-btn-test");
      const testResultLabel = doc.getElementById("pp-pref-test-result");
      const saveStatusLabel = doc.getElementById("pp-pref-save-status");

      if (transSelect) transSelect.value = prefs.translationService;
      if (targetLangSelect) targetLangSelect.value = prefs.targetLanguage;
      if (autoTransCb) autoTransCb.checked = prefs.autoTranslateSelection;
      if (providerSelect) providerSelect.value = prefs.selectedAIProvider;
      if (domainSelect) domainSelect.value = prefs.defaultDomain;

      const domainPromptDrafts = {};

      const getDomainPromptTemplate = (domain) => {
        const zotero = getZotero();
        if (zotero?.PaperPilot?.getInterpretationPromptTemplate) {
          try {
            return zotero.PaperPilot.getInterpretationPromptTemplate(domain);
          } catch (e) {}
        }
        return "请对以下文献选段进行专业解读：\n\n{text}";
      };

      const getDefaultDomainPromptTemplate = (domain) => {
        const zotero = getZotero();
        if (zotero?.PaperPilot?.getDefaultInterpretationPromptTemplate) {
          try {
            return zotero.PaperPilot.getDefaultInterpretationPromptTemplate(domain);
          } catch (e) {}
        }
        return "请对以下文献选段进行专业解读：\n\n{text}";
      };

      let currentDomainKey = domainSelect ? domainSelect.value : "general";

      const loadPromptForDomain = (domain) => {
        if (domainPromptDrafts[domain] !== undefined) {
          if (customPromptArea) customPromptArea.value = domainPromptDrafts[domain];
        } else if (
          prefs.interpretationPromptOverrides &&
          prefs.interpretationPromptOverrides[domain]
        ) {
          const val = prefs.interpretationPromptOverrides[domain];
          domainPromptDrafts[domain] = val;
          if (customPromptArea) customPromptArea.value = val;
        } else {
          const tpl = getDomainPromptTemplate(domain);
          domainPromptDrafts[domain] = tpl;
          if (customPromptArea) customPromptArea.value = tpl;
        }
        if (promptWarningLabel) promptWarningLabel.style.display = "none";
      };

      loadPromptForDomain(currentDomainKey);

      domainSelect?.addEventListener("change", () => {
        if (customPromptArea) {
          domainPromptDrafts[currentDomainKey] = customPromptArea.value;
        }
        currentDomainKey = domainSelect.value;
        loadPromptForDomain(currentDomainKey);
      });

      resetDomainPromptBtn?.addEventListener("click", () => {
        const defaultTpl = getDefaultDomainPromptTemplate(currentDomainKey);
        if (customPromptArea) {
          customPromptArea.value = defaultTpl;
        }
        domainPromptDrafts[currentDomainKey] = defaultTpl;
        if (prefs.interpretationPromptOverrides) {
          delete prefs.interpretationPromptOverrides[currentDomainKey];
        }
        if (promptWarningLabel) promptWarningLabel.style.display = "none";
        dump(`[PaperPilot Prefs] Reset prompt for domain: ${currentDomainKey}\n`);
      });

      let currentProviderKey = providerSelect ? providerSelect.value : "zhipu";

      const syncProviderUI = (providerKey) => {
        const cfg =
          prefs.aiProviders[providerKey] ||
          defaultProviders[providerKey] ||
          defaultProviders.custom;
        if (apiKeyInput) apiKeyInput.value = cfg.apiKey || "";
        if (baseUrlInput) baseUrlInput.value = cfg.baseUrl || "";
        if (modelInput) modelInput.value = cfg.model || "";
      };

      const saveCurrentFieldsToCache = (providerKey) => {
        if (!prefs.aiProviders[providerKey]) {
          prefs.aiProviders[providerKey] = {
            ...(defaultProviders[providerKey] || defaultProviders.custom),
          };
        }
        if (apiKeyInput) prefs.aiProviders[providerKey].apiKey = apiKeyInput.value.trim();
        if (baseUrlInput) prefs.aiProviders[providerKey].baseUrl = baseUrlInput.value.trim();
        if (modelInput) prefs.aiProviders[providerKey].model = modelInput.value.trim();
      };

      // Initial render for active provider
      syncProviderUI(currentProviderKey);

      // Prevent data loss when switching providers before saving
      providerSelect?.addEventListener("change", () => {
        saveCurrentFieldsToCache(currentProviderKey);
        currentProviderKey = providerSelect.value;
        syncProviderUI(currentProviderKey);
      });

      // Save button click handler (closed-loop)
      saveBtn.addEventListener("click", () => {
        dump("[PaperPilot Prefs] save requested\n");

        if (customPromptArea) {
          domainPromptDrafts[currentDomainKey] = customPromptArea.value;
        }

        // Validate that current prompt has {text}
        const currentVal = customPromptArea ? customPromptArea.value : "";
        if (!currentVal.includes("{text}")) {
          if (promptWarningLabel) {
            promptWarningLabel.textContent = "⚠️ 提示词必须包含 {text} 占位符，否则 AI 无法接收所选文字！";
            promptWarningLabel.style.display = "block";
          }
          if (saveStatusLabel) {
            saveStatusLabel.textContent = "❌ 保存失败: 提示词缺少 {text}";
            saveStatusLabel.style.color = "#dc2626";
            saveStatusLabel.style.display = "inline";
          }
          return;
        }
        if (promptWarningLabel) {
          promptWarningLabel.style.display = "none";
        }

        saveCurrentFieldsToCache(currentProviderKey);
        prefs.selectedAIProvider = currentProviderKey;
        if (transSelect) prefs.translationService = transSelect.value;
        if (targetLangSelect) prefs.targetLanguage = targetLangSelect.value;
        if (autoTransCb) prefs.autoTranslateSelection = autoTransCb.checked;
        if (domainSelect) prefs.defaultDomain = domainSelect.value;

        // Persist overrides from drafts
        if (!prefs.interpretationPromptOverrides) {
          prefs.interpretationPromptOverrides = {};
        }
        for (const [dKey, dVal] of Object.entries(domainPromptDrafts)) {
          const defTpl = getDefaultDomainPromptTemplate(dKey);
          if (typeof dVal === "string" && dVal.trim() && dVal.trim() !== defTpl.trim()) {
            prefs.interpretationPromptOverrides[dKey] = dVal.trim();
          } else {
            delete prefs.interpretationPromptOverrides[dKey];
          }
        }

        if (domainPromptDrafts["custom"]) {
          prefs.customPromptTemplate = domainPromptDrafts["custom"];
        } else if (customPromptArea) {
          prefs.customPromptTemplate = customPromptArea.value;
        }

        const success = PaperPilot_Preferences.savePrefs(prefs);

        if (success) {
          // Immediately re-read pref to confirm persistence
          const confirmed = PaperPilot_Preferences.getPrefs();
          if (confirmed && confirmed.selectedAIProvider === prefs.selectedAIProvider) {
            dump("[PaperPilot Prefs] persisted\n");
          }

          // Reload live instance preferences
          const zotero = getZotero();
          if (
            zotero?.PaperPilot &&
            typeof zotero.PaperPilot.reloadPreferences === "function"
          ) {
            zotero.PaperPilot.reloadPreferences();
            dump("[PaperPilot Prefs] live preferences reloaded\n");
          }

          if (saveStatusLabel) {
            saveStatusLabel.textContent = "✅ 配置已成功保存并实时生效！";
            saveStatusLabel.style.color = "#16a34a";
            saveStatusLabel.style.display = "inline";
            setTimeout(() => {
              saveStatusLabel.style.display = "none";
            }, 3000);
          }
        } else {
          if (saveStatusLabel) {
            saveStatusLabel.textContent = "❌ 保存失败，请检查控制台";
            saveStatusLabel.style.color = "#dc2626";
            saveStatusLabel.style.display = "inline";
          }
        }
      });

      // Test API Connection handler
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
          const endpoint = `${baseUrl}/chat/completions`;
          const reqHeaders = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          };
          const reqBody = JSON.stringify({
            model: model,
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 5,
          });

          const zotero = getZotero();
          if (zotero && zotero.HTTP && typeof zotero.HTTP.request === "function") {
            const xhr = await zotero.HTTP.request("POST", endpoint, {
              headers: reqHeaders,
              body: reqBody,
              responseType: "json",
              timeout: 30000,
            });

            if (xhr && xhr.status >= 200 && xhr.status < 300) {
              if (testResultLabel) {
                testResultLabel.textContent = `✅ 连接成功！API 正常响应 (HTTP ${xhr.status})`;
                testResultLabel.style.color = "#16a34a";
              }
            } else {
              const status = xhr ? xhr.status : "unknown";
              let errTxt = xhr ? xhr.responseText || "" : "";
              try {
                const errJson = xhr?.response || (xhr?.responseText ? JSON.parse(xhr.responseText) : null);
                if (errJson?.error?.message) errTxt = errJson.error.message;
              } catch (e) {}
              if (testResultLabel) {
                testResultLabel.textContent = `❌ 请求失败 (HTTP ${status}): ${errTxt.slice(0, 100)}`;
                testResultLabel.style.color = "#dc2626";
              }
            }
          } else {
            const res = await fetch(endpoint, {
              method: "POST",
              headers: reqHeaders,
              body: reqBody,
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
          }
        } catch (err) {
          if (testResultLabel) {
            testResultLabel.textContent = `❌ 网络连接异常: ${err.message || err}`;
            testResultLabel.style.color = "#dc2626";
          }
        }
      });

      dump("[PaperPilot Prefs] init complete\n");
    },
  };

  // Expose globally
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
})();
