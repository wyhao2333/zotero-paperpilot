import { EventBus } from "../../core/event-bus";
import { PreferenceManager, DEFAULT_AI_PROVIDERS } from "../../core/preferences";
import { StorageManager } from "../../core/storage";
import { ChatMessage, DomainType, PaperHistory } from "../../types/zotero";
import { ChatView } from "./chat-view";
import { NoteExporter } from "./note-exporter";
import { PromptManager, DOMAIN_PROMPTS } from "../ai/prompts";
import { AIClient } from "../ai/client";
import { PaperDigestService } from "../ai/digest";
import { TranslatorManager } from "../translator";

export class SidebarPanel {
  private container: HTMLElement;
  private chatView!: ChatView;
  private currentItemKey: string = "";
  private currentTitle: string = "";
  private currentParentItemID: number = 0;
  private history: PaperHistory = { itemKey: "", title: "", messages: [], lastUpdated: Date.now() };
  private pendingQuote: string = "";

  constructor(container: HTMLElement) {
    this.container = container;
    this.render();
    this.bindEvents();
  }

  async loadPaper(itemKey: string, title: string, parentItemID: number): Promise<void> {
    this.currentItemKey = itemKey;
    this.currentTitle = title || "当前论文";
    this.currentParentItemID = parentItemID;

    const titleEl = this.container.querySelector("#pp-paper-title");
    if (titleEl) {
      titleEl.textContent = this.currentTitle;
    }

    this.history = await StorageManager.getHistory(itemKey);
    this.history.title = this.currentTitle;
    this.chatView.render(this.history.messages);
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="paperpilot-sidebar">
        <!-- Header -->
        <div class="paperpilot-header">
          <div class="paperpilot-title">
            <span>🚀</span>
            <span id="pp-paper-title" style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              PaperPilot
            </span>
          </div>
          <div style="display:flex; gap:4px;">
            <button class="paperpilot-btn" id="pp-btn-digest" title="一键生成全文精读报告">📑 全文速读</button>
            <button class="paperpilot-btn" id="pp-btn-export" title="导出对话至 Zotero 笔记">💾 笔记</button>
            <button class="paperpilot-btn" id="pp-btn-clear" title="清空当前论文对话">🗑️</button>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="paperpilot-tabs">
          <div class="paperpilot-tab-item active" data-tab="chat">💬 问答/解读</div>
          <div class="paperpilot-tab-item" data-tab="translate">🌐 划词翻译</div>
          <div class="paperpilot-tab-item" data-tab="settings">⚙️ 设置</div>
        </div>

        <!-- Tab 1: Chat & Interpretation -->
        <div class="paperpilot-tab-content" id="tab-content-chat" style="display:flex;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:11px; color:var(--pp-text-muted);">解读领域:</span>
            <select id="pp-domain-select" style="font-size:11px; padding:2px 4px; border-radius:4px; border:1px solid var(--pp-border); background:var(--pp-bg); color:var(--pp-text);">
              <option value="general">通用学术 (跨学科)</option>
              <option value="cs_ai">计算机与人工智能 (CS/AI)</option>
              <option value="med_bio">医学与生物生命科学 (Med/Bio)</option>
              <option value="econ_social">经济金融与人文社科</option>
              <option value="engineering">工程与物理科学</option>
              <option value="custom">自定义领域</option>
            </select>
          </div>

          <div class="paperpilot-chat-history" id="pp-chat-container"></div>

          <!-- Pending Quote Banner -->
          <div id="pp-quote-banner" style="display:none; background:var(--pp-primary-light); padding:6px 8px; border-radius:4px; font-size:11px; border-left:3px solid var(--pp-primary); margin-top:4px;">
            <div style="display:flex; justify-content:space-between;">
              <strong style="color:var(--pp-primary);">已选定引用选段:</strong>
              <span id="pp-close-quote" style="cursor:pointer; font-weight:bold;">✕</span>
            </div>
            <div id="pp-quote-text" style="opacity:0.85; margin-top:2px; max-height:40px; overflow:hidden; text-overflow:ellipsis;"></div>
          </div>

          <!-- Input Box -->
          <div class="paperpilot-input-box" style="padding: 6px 0 0 0;">
            <textarea class="paperpilot-textarea" id="pp-chat-input" placeholder="输入问题或选中论文内容追问 (Enter 发送, Shift+Enter 换行)..."></textarea>
            <div class="paperpilot-toolbar-row">
              <span style="font-size:11px; color:var(--pp-text-muted);">Zotero 10 伴读</span>
              <button class="paperpilot-btn primary" id="pp-btn-send" style="padding:4px 12px;">发送</button>
            </div>
          </div>
        </div>

        <!-- Tab 2: Translation View -->
        <div class="paperpilot-tab-content" id="tab-content-translate" style="display:none;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-weight:600; font-size:12px;">划词原文</span>
            <button class="paperpilot-btn" id="pp-btn-retranslate" style="font-size:11px;">🔄 重新翻译</button>
          </div>
          <div id="pp-trans-source" style="background:var(--pp-bg-secondary); border:1px solid var(--pp-border); border-radius:6px; padding:8px; font-size:12px; min-height:60px; max-height:120px; overflow-y:auto; word-break:break-word;">
            （在 PDF 中划词即可自动同步显示）
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; margin-bottom:8px;">
            <span style="font-weight:600; font-size:12px;">译文结果</span>
            <button class="paperpilot-btn" id="pp-btn-copy-trans" style="font-size:11px;">📋 复制译文</button>
          </div>
          <div id="pp-trans-result" style="background:var(--pp-bg-secondary); border:1px solid var(--pp-border); border-radius:6px; padding:8px; font-size:13px; flex:1; overflow-y:auto; word-break:break-word; line-height:1.5;">
            等待划词翻译...
          </div>
        </div>

        <!-- Tab 3: Settings View -->
        <div class="paperpilot-tab-content" id="tab-content-settings" style="display:none;">
          <div style="display:flex; flex-direction:column; gap:12px; font-size:12px;">
            <div>
              <label style="font-weight:600; display:block; margin-bottom:4px;">翻译服务引擎:</label>
              <select id="cfg-trans-service" style="width:100%; padding:5px; border-radius:4px; border:1px solid var(--pp-border); background:var(--pp-bg); color:var(--pp-text);">
                <option value="google">Google 免费翻译 (GTX 免 Key)</option>
                <option value="bing">Bing 免费翻译</option>
                <option value="ai">AI 大模型翻译 (基于下方配置)</option>
              </select>
            </div>

            <div style="display:flex; align-items:center; gap:6px;">
              <input type="checkbox" id="cfg-auto-trans" />
              <label for="cfg-auto-trans">划词后立即自动翻译</label>
            </div>

            <hr style="border:none; border-top:1px solid var(--pp-border); margin:4px 0;"/>

            <div>
              <label style="font-weight:600; display:block; margin-bottom:4px;">AI 服务商 / 接口模式:</label>
              <select id="cfg-ai-provider" style="width:100%; padding:5px; border-radius:4px; border:1px solid var(--pp-border); background:var(--pp-bg); color:var(--pp-text);">
                <option value="zhipu">智谱清言 (GLM)</option>
                <option value="deepseek">DeepSeek</option>
                <option value="openai">OpenAI (ChatGPT)</option>
                <option value="moonshot">Moonshot (Kimi)</option>
                <option value="qwen">通义千问 (Qwen)</option>
                <option value="siliconflow">硅基流动 (SiliconFlow)</option>
                <option value="ollama">本地 Ollama</option>
                <option value="custom">自定义 API 接口 (Custom Endpoint)</option>
              </select>
            </div>

            <div>
              <label style="font-weight:600; display:block; margin-bottom:4px;">API Key:</label>
              <input type="password" id="cfg-api-key" placeholder="填入对应服务商的 API Key" style="width:100%; box-sizing:border-box; padding:5px; border-radius:4px; border:1px solid var(--pp-border); background:var(--pp-bg); color:var(--pp-text);" />
            </div>

            <div>
              <label style="font-weight:600; display:block; margin-bottom:4px;">Base URL (API 根地址):</label>
              <input type="text" id="cfg-base-url" placeholder="https://..." style="width:100%; box-sizing:border-box; padding:5px; border-radius:4px; border:1px solid var(--pp-border); background:var(--pp-bg); color:var(--pp-text);" />
            </div>

            <div>
              <label style="font-weight:600; display:block; margin-bottom:4px;">模型名称 (Model):</label>
              <input type="text" id="cfg-model" placeholder="e.g. glm-4-flash, deepseek-chat" style="width:100%; box-sizing:border-box; padding:5px; border-radius:4px; border:1px solid var(--pp-border); background:var(--pp-bg); color:var(--pp-text);" />
            </div>

            <button class="paperpilot-btn primary" id="cfg-btn-save" style="padding:6px; justify-content:center; margin-top:4px;">💾 保存设置</button>
            <div id="cfg-save-status" style="font-size:11px; color:#16a34a; text-align:center; display:none;">配置已成功保存！</div>
          </div>
        </div>
      </div>
    `;

    const chatContainer = this.container.querySelector("#pp-chat-container") as HTMLElement;
    this.chatView = new ChatView(chatContainer);
    this.initSettingsUI();
  }

  private initSettingsUI(): void {
    const prefs = PreferenceManager.get();
    const providerSelect = this.container.querySelector("#cfg-ai-provider") as HTMLSelectElement;
    const transSelect = this.container.querySelector("#cfg-trans-service") as HTMLSelectElement;
    const autoTransCb = this.container.querySelector("#cfg-auto-trans") as HTMLInputElement;
    const apiKeyInput = this.container.querySelector("#cfg-api-key") as HTMLInputElement;
    const baseUrlInput = this.container.querySelector("#cfg-base-url") as HTMLInputElement;
    const modelInput = this.container.querySelector("#cfg-model") as HTMLInputElement;
    const domainSelect = this.container.querySelector("#pp-domain-select") as HTMLSelectElement;

    if (transSelect) transSelect.value = prefs.translationService;
    if (autoTransCb) autoTransCb.checked = prefs.autoTranslateSelection;
    if (providerSelect) providerSelect.value = prefs.selectedAIProvider;
    if (domainSelect) domainSelect.value = prefs.defaultDomain;

    const updateProviderFields = () => {
      const pKey = providerSelect.value;
      const config = prefs.aiProviders[pKey] || DEFAULT_AI_PROVIDERS[pKey] || DEFAULT_AI_PROVIDERS.custom;
      apiKeyInput.value = config.apiKey || "";
      baseUrlInput.value = config.baseUrl || "";
      modelInput.value = config.model || "";
    };

    updateProviderFields();

    providerSelect.addEventListener("change", () => {
      updateProviderFields();
    });

    const saveBtn = this.container.querySelector("#cfg-btn-save");
    saveBtn?.addEventListener("click", () => {
      const pKey = providerSelect.value;
      const currentConfig = prefs.aiProviders[pKey] || { ...DEFAULT_AI_PROVIDERS[pKey] };
      currentConfig.apiKey = apiKeyInput.value.trim();
      currentConfig.baseUrl = baseUrlInput.value.trim();
      currentConfig.model = modelInput.value.trim();

      prefs.aiProviders[pKey] = currentConfig;
      prefs.selectedAIProvider = pKey;
      prefs.translationService = transSelect.value as any;
      prefs.autoTranslateSelection = autoTransCb.checked;
      prefs.defaultDomain = domainSelect.value as DomainType;

      PreferenceManager.set(prefs);

      const status = this.container.querySelector("#cfg-save-status") as HTMLElement;
      if (status) {
        status.style.display = "block";
        setTimeout(() => (status.style.display = "none"), 2000);
      }
    });
  }

  private bindEvents(): void {
    // Tab switching
    const tabItems = this.container.querySelectorAll(".paperpilot-tab-item");
    tabItems.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabItems.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const tabName = tab.getAttribute("data-tab");

        ["chat", "translate", "settings"].forEach((name) => {
          const content = this.container.querySelector(`#tab-content-${name}`) as HTMLElement;
          if (content) {
            content.style.display = name === tabName ? "flex" : "none";
          }
        });
      });
    });

    // Close quote banner
    this.container.querySelector("#pp-close-quote")?.addEventListener("click", () => {
      this.clearQuote();
    });

    // Send button & key events
    const input = this.container.querySelector("#pp-chat-input") as HTMLTextAreaElement;
    const sendBtn = this.container.querySelector("#pp-btn-send");

    const doSend = () => {
      const val = input.value.trim();
      if (!val && !this.pendingQuote) return;
      this.handleUserSendMessage(val, this.pendingQuote);
      input.value = "";
      this.clearQuote();
    };

    sendBtn?.addEventListener("click", doSend);
    input?.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    });

    // Action buttons in Header
    this.container.querySelector("#pp-btn-digest")?.addEventListener("click", () => {
      this.handleGenerateDigest();
    });

    this.container.querySelector("#pp-btn-export")?.addEventListener("click", async () => {
      if (!this.history.messages.length) {
        alert("当前尚无对话记录可导出。");
        return;
      }
      const ok = await NoteExporter.exportToZoteroNote(this.currentParentItemID, this.currentTitle, this.history.messages);
      alert(ok ? "已成功保存为 Zotero 文献笔记！" : "保存笔记失败，请检查条目权限。");
    });

    this.container.querySelector("#pp-btn-clear")?.addEventListener("click", async () => {
      if (confirm("确定要清空当前文献的所有 PaperPilot 对话历史吗？")) {
        await StorageManager.clearHistory(this.currentItemKey);
        this.history.messages = [];
        this.chatView.render([]);
      }
    });

    // Translation Tab copy button
    this.container.querySelector("#pp-btn-copy-trans")?.addEventListener("click", () => {
      const transResult = this.container.querySelector("#pp-trans-result")?.textContent || "";
      if (transResult && navigator.clipboard) {
        navigator.clipboard.writeText(transResult);
        const btn = this.container.querySelector("#pp-btn-copy-trans") as HTMLButtonElement;
        btn.textContent = "已复制!";
        setTimeout(() => (btn.textContent = "📋 复制译文"), 1500);
      }
    });

    // EventBus listeners
    EventBus.on("action:interpret", (data: { text: string }) => {
      this.switchTab("chat");
      const domainSelect = this.container.querySelector("#pp-domain-select") as HTMLSelectElement;
      const domain = (domainSelect ? domainSelect.value : "general") as DomainType;
      this.handleInterpret(data.text, domain);
    });

    EventBus.on("action:ask", (data: { quote: string }) => {
      this.switchTab("chat");
      this.setQuote(data.quote);
      const inputEl = this.container.querySelector("#pp-chat-input") as HTMLTextAreaElement;
      inputEl?.focus();
    });

    EventBus.on("action:translated", (data: { source: string; translated: string }) => {
      const srcEl = this.container.querySelector("#pp-trans-source");
      const resEl = this.container.querySelector("#pp-trans-result");
      if (srcEl) srcEl.textContent = data.source;
      if (resEl) resEl.textContent = data.translated;
    });
  }

  private switchTab(tabName: string): void {
    const tabItem = this.container.querySelector(`.paperpilot-tab-item[data-tab="${tabName}"]`) as HTMLElement;
    tabItem?.click();
  }

  private setQuote(text: string): void {
    this.pendingQuote = text;
    const banner = this.container.querySelector("#pp-quote-banner") as HTMLElement;
    const textEl = this.container.querySelector("#pp-quote-text") as HTMLElement;
    if (banner && textEl) {
      banner.style.display = "block";
      textEl.textContent = text;
    }
  }

  private clearQuote(): void {
    this.pendingQuote = "";
    const banner = this.container.querySelector("#pp-quote-banner") as HTMLElement;
    if (banner) banner.style.display = "none";
  }

  private async handleUserSendMessage(content: string, quote?: string): Promise<void> {
    const userMsg: ChatMessage = {
      id: "u_" + Date.now(),
      role: "user",
      content: content || "请解读上述选段",
      timestamp: Date.now(),
      selectedQuote: quote,
    };

    this.history.messages.push(userMsg);
    this.chatView.appendMessage(userMsg);
    await StorageManager.saveHistory(this.history);

    const aiMsgId = "a_" + Date.now();
    const aiMsg: ChatMessage = {
      id: aiMsgId,
      role: "assistant",
      content: "思考中...",
      timestamp: Date.now(),
    };
    this.history.messages.push(aiMsg);
    this.chatView.appendMessage(aiMsg);

    // Build context
    const messagesPayload: { role: "system" | "user" | "assistant"; content: string }[] = [
      {
        role: "system",
        content: "你是一位专业高效的学术伴读助手 PaperPilot。针对用户的提问或论文选段，给出清晰、严谨、有洞见的学术解答。",
      },
    ];

    // Append history
    for (const m of this.history.messages.slice(-6)) {
      if (m.id === aiMsgId) break;
      let text = m.content;
      if (m.selectedQuote) {
        text = `【引用文献选段】: ${m.selectedQuote}\n${text}`;
      }
      messagesPayload.push({ role: m.role, content: text });
    }

    try {
      let fullResponse = "";
      await AIClient.chat(messagesPayload, {
        onChunk: (delta, accumulated) => {
          fullResponse = accumulated;
          this.chatView.updateStreamingMessage(aiMsgId, accumulated);
        },
      });

      aiMsg.content = fullResponse;
      await StorageManager.saveHistory(this.history);
    } catch (e: any) {
      aiMsg.content = `❌ 出错: ${e.message || e}`;
      this.chatView.updateStreamingMessage(aiMsgId, aiMsg.content);
      await StorageManager.saveHistory(this.history);
    }
  }

  private async handleInterpret(text: string, domain: DomainType): Promise<void> {
    const promptConfig = DOMAIN_PROMPTS[domain];
    const userMsg: ChatMessage = {
      id: "u_" + Date.now(),
      role: "user",
      content: `请求对所选句段进行【${promptConfig.name}】专业解读`,
      timestamp: Date.now(),
      selectedQuote: text,
      domain: promptConfig.badge,
    };

    this.history.messages.push(userMsg);
    this.chatView.appendMessage(userMsg);
    await StorageManager.saveHistory(this.history);

    const aiMsgId = "a_" + Date.now();
    const aiMsg: ChatMessage = {
      id: aiMsgId,
      role: "assistant",
      content: "正在深度解读中...",
      timestamp: Date.now(),
      domain: promptConfig.badge,
    };
    this.history.messages.push(aiMsg);
    this.chatView.appendMessage(aiMsg);

    const messages = PromptManager.buildInterpretationMessages(text, domain);

    try {
      let fullResponse = "";
      await AIClient.chat(messages, {
        onChunk: (delta, accumulated) => {
          fullResponse = accumulated;
          this.chatView.updateStreamingMessage(aiMsgId, accumulated);
        },
      });

      aiMsg.content = fullResponse;
      await StorageManager.saveHistory(this.history);
    } catch (e: any) {
      aiMsg.content = `❌ 解读失败: ${e.message || e}`;
      this.chatView.updateStreamingMessage(aiMsgId, aiMsg.content);
      await StorageManager.saveHistory(this.history);
    }
  }

  private async handleGenerateDigest(): Promise<void> {
    this.switchTab("chat");
    const userMsg: ChatMessage = {
      id: "u_" + Date.now(),
      role: "user",
      content: "请为这篇论文生成一键全文精读报告",
      timestamp: Date.now(),
    };
    this.history.messages.push(userMsg);
    this.chatView.appendMessage(userMsg);
    await StorageManager.saveHistory(this.history);

    const aiMsgId = "a_" + Date.now();
    const aiMsg: ChatMessage = {
      id: aiMsgId,
      role: "assistant",
      content: "正在精读论文并提取核心四要素...",
      timestamp: Date.now(),
      domain: "全文精读",
    };
    this.history.messages.push(aiMsg);
    this.chatView.appendMessage(aiMsg);

    try {
      let fullResponse = "";
      await PaperDigestService.generateDigest(
        {
          title: this.currentTitle,
          authors: "文献作者群",
          abstract: "正在从当前阅读器检索摘要...",
        },
        (delta, accumulated) => {
          fullResponse = accumulated;
          this.chatView.updateStreamingMessage(aiMsgId, accumulated);
        }
      );

      aiMsg.content = fullResponse;
      await StorageManager.saveHistory(this.history);
    } catch (e: any) {
      aiMsg.content = `❌ 生成报告失败: ${e.message || e}`;
      this.chatView.updateStreamingMessage(aiMsgId, aiMsg.content);
      await StorageManager.saveHistory(this.history);
    }
  }
}
