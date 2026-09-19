import { EventBus } from "../../core/event-bus";
import { PreferenceManager, DEFAULT_AI_PROVIDERS } from "../../core/preferences";
import { StorageManager } from "../../core/storage";
import { ChatMessage, ChatSession, DomainType, PaperHistory, PDFChatHistory } from "../../types/zotero";
import { ChatView } from "./chat-view";
import { NoteExporter } from "./note-exporter";
import { PromptManager, DOMAIN_PROMPTS } from "../ai/prompts";
import { AIClient } from "../ai/client";
import { PaperDigestService } from "../ai/digest";
import { PendingAction } from "./controller";
import { PaperContextService } from "../reader/paper-context";

const HTML_NS = "http://www.w3.org/1999/xhtml";

export class SidebarPanel {
  private container: HTMLElement;
  private chatView!: ChatView;
  private currentItemKey: string = "";
  private currentTitle: string = "";
  private currentParentItemID: number = 0;
  private currentAttachmentID: number = 0;
  private pdfHistory: PDFChatHistory = {
    schemaVersion: 2,
    storageKey: "",
    title: "",
    activeSessionId: "",
    sessions: [],
    lastUpdated: Date.now(),
  };
  private pendingQuote: string = "";

  constructor(container: HTMLElement) {
    this.container = container;
    this.render();
    this.bindEvents();
    // Panel registration is exclusively performed in onRender where tabID is explicitly known.
  }

  public getActiveSession(): ChatSession {
    if (!this.pdfHistory.sessions || this.pdfHistory.sessions.length === 0) {
      const s = StorageManager.createSession(this.pdfHistory, "对话 1");
      return s;
    }
    const found = this.pdfHistory.sessions.find((s) => s.id === this.pdfHistory.activeSessionId);
    if (found) return found;
    this.pdfHistory.activeSessionId = this.pdfHistory.sessions[0].id;
    return this.pdfHistory.sessions[0];
  }

  public updateSessionSelectUI(): void {
    const select = this.container.querySelector("#pp-session-select") as HTMLSelectElement;
    if (!select) return;
    const doc = this.container.ownerDocument;

    while (select.firstChild) {
      select.removeChild(select.firstChild);
    }

    for (const s of this.pdfHistory.sessions) {
      const opt = doc.createElementNS(HTML_NS, "option") as HTMLOptionElement;
      opt.value = s.id;
      opt.textContent = s.title || "未命名会话";
      if (s.id === this.pdfHistory.activeSessionId) {
        opt.selected = true;
      }
      select.appendChild(opt);
    }
    select.value = this.pdfHistory.activeSessionId;
  }

  async loadPaper(
    itemKey: string,
    title: string,
    parentItemID: number,
    attachmentID?: number
  ): Promise<void> {
    // Reset attachment ID before resolving new attachment to prevent stale cross-tab context
    this.currentAttachmentID = 0;
    this.currentItemKey = itemKey;
    this.currentTitle = title || "当前论文";
    this.currentParentItemID = parentItemID;

    if (attachmentID) {
      this.currentAttachmentID = attachmentID;
    } else if (parentItemID) {
      const resolved = await PaperContextService.resolveAttachmentID(parentItemID);
      if (resolved) this.currentAttachmentID = resolved;
    }

    const titleEl = this.container.querySelector("#pp-paper-title");
    if (titleEl) {
      titleEl.textContent = this.currentTitle;
    }

    this.pdfHistory = await StorageManager.getPDFHistory(
      this.currentAttachmentID,
      itemKey,
      this.currentTitle
    );
    this.pdfHistory.title = this.currentTitle;

    this.updateSessionSelectUI();
    const session = this.getActiveSession();
    this.chatView.render(session.messages);
  }

  /**
   * Consumes pending actions dispatched from selection popup or controller.
   * Returns true only when delivery and UI state update strictly succeed.
   */
  handlePendingAction(action: PendingAction): boolean {
    if (!action) return false;

    if (action.attachmentID && !this.currentAttachmentID) {
      this.currentAttachmentID = action.attachmentID;
    }

    if (action.type === "ask") {
      this.switchTab("chat");
      this.setQuote(action.selectedText);

      const banner = this.container.querySelector("#pp-quote-banner") as HTMLElement;
      const quoteEl = this.container.querySelector("#pp-quote-text") as HTMLElement;
      const input = this.container.querySelector("#pp-chat-input") as HTMLTextAreaElement;

      if (!banner || !quoteEl || !input) {
        return false;
      }

      input.focus();

      return (
        banner.style.display !== "none" &&
        quoteEl.textContent === action.selectedText
      );
    } else if (action.type === "interpret") {
      this.switchTab("chat");
      const domainSelect = this.container.querySelector("#pp-domain-select") as HTMLSelectElement;
      const domain = (domainSelect ? domainSelect.value : "general") as DomainType;
      this.handleInterpret(action.selectedText, domain);
      return true;
    }

    return false;
  }

  private render(): void {
    const doc = this.container.ownerDocument;
    const win = doc.defaultView;
    const MozXULElement =
      win?.MozXULElement ||
      (typeof MozXULElement !== "undefined"
        ? MozXULElement
        : typeof Zotero !== "undefined" && (Zotero as any).getMainWindow?.()?.MozXULElement);

    const markup = `
<html:div
  xmlns:html="http://www.w3.org/1999/xhtml"
  class="paperpilot-sidebar">

  <!-- Header -->
  <html:div class="paperpilot-header">
    <html:div class="paperpilot-title">
      <html:span>🚀</html:span>
      <html:span id="pp-paper-title" style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        PaperPilot
      </html:span>
    </html:div>
    <html:div style="display:flex; gap:4px;">
      <html:button class="paperpilot-btn" id="pp-btn-digest" title="一键生成全文精读报告">📑 全文速读</html:button>
      <html:button class="paperpilot-btn" id="pp-btn-export" title="导出对话至 Zotero 笔记">💾 笔记</html:button>
      <html:button class="paperpilot-btn" id="pp-btn-clear" title="清空当前论文对话">🗑️</html:button>
    </html:div>
  </html:div>

  <!-- Navigation Tabs -->
  <html:div class="paperpilot-tabs">
    <html:div class="paperpilot-tab-item active" data-tab="chat">💬 伴读问答</html:div>
    <html:div class="paperpilot-tab-item" data-tab="settings">⚙️ 设置</html:div>
  </html:div>

  <!-- Tab 1: Chat & Interpretation with Full-text Context -->
  <html:div class="paperpilot-tab-content" id="tab-content-chat" style="display:flex;">
    <html:div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; gap:4px;">
      <html:div style="display:flex; align-items:center; gap:3px; min-width:0; flex:1;">
        <html:span style="font-size:11px; color:var(--pp-text-muted); flex-shrink:0;">会话:</html:span>
        <html:select id="pp-session-select" style="font-size:11px; max-width:115px; padding:2px 3px; border-radius:4px; border:1px solid var(--pp-border); background:var(--pp-bg); color:var(--pp-text); flex:1; min-width:0;"></html:select>
        <html:button class="paperpilot-btn" id="pp-btn-new-session" title="新建对话" style="padding:1px 5px; font-size:11px; flex-shrink:0;">+</html:button>
      </html:div>
      <html:div style="display:flex; align-items:center; gap:3px; flex-shrink:0;">
        <html:span style="font-size:11px; color:var(--pp-text-muted);">领域:</html:span>
        <html:select id="pp-domain-select" style="font-size:11px; padding:2px 4px; border-radius:4px; border:1px solid var(--pp-border); background:var(--pp-bg); color:var(--pp-text);">
          <html:option value="general">通用学术 (跨学科)</html:option>
          <html:option value="cs_ai">计算机与人工智能 (CS/AI)</html:option>
          <html:option value="med_bio">医学与生物生命科学 (Med/Bio)</html:option>
          <html:option value="econ_social">经济金融与人文社科</html:option>
          <html:option value="engineering">工程与物理科学</html:option>
          <html:option value="custom">自定义领域</html:option>
        </html:select>
      </html:div>
    </html:div>

    <html:div class="paperpilot-chat-history" id="pp-chat-container"></html:div>

    <!-- Pending Quote Banner -->
    <html:div id="pp-quote-banner" style="display:none; background:var(--pp-primary-light); padding:6px 8px; border-radius:4px; font-size:11px; border-left:3px solid var(--pp-primary); margin-top:4px;">
      <html:div style="display:flex; justify-content:space-between;">
        <html:strong style="color:var(--pp-primary);">已选定引用选段:</html:strong>
        <html:span id="pp-close-quote" style="cursor:pointer; font-weight:bold;">✕</html:span>
      </html:div>
      <html:div id="pp-quote-text" style="opacity:0.85; margin-top:2px; max-height:45px; overflow:hidden; text-overflow:ellipsis;"></html:div>
    </html:div>

    <!-- Input Box -->
    <html:div class="paperpilot-input-box" style="padding: 6px 0 0 0;">
      <html:textarea class="paperpilot-textarea" id="pp-chat-input" placeholder="输入问题或选中论文内容追问 (Enter 发送, Shift+Enter 换行)..."></html:textarea>
      <html:div class="paperpilot-toolbar-row">
        <html:span style="font-size:11px; color:var(--pp-text-muted);">结合 PDF 全文推理</html:span>
        <html:button class="paperpilot-btn primary" id="pp-btn-send" style="padding:4px 12px;">发送</html:button>
      </html:div>
    </html:div>
  </html:div>

  <!-- Tab 2: Settings View -->
  <html:div class="paperpilot-tab-content" id="tab-content-settings" style="display:none;">
    <html:div style="display:flex; flex-direction:column; gap:12px; font-size:12px;">
      <html:div>
        <html:label style="font-weight:600; display:block; margin-bottom:4px;">划词翻译引擎:</html:label>
        <html:select id="cfg-trans-service" style="width:100%; padding:5px; border-radius:4px; border:1px solid var(--pp-border); background:var(--pp-bg); color:var(--pp-text);">
          <html:option value="mymemory">MyMemory (国内免 Key 直连)</html:option>
          <html:option value="google">Google 免费翻译 (GTX 免 Key)</html:option>
          <html:option value="bing">Bing 免费翻译</html:option>
          <html:option value="youdao">有道词典 (国内免 Key 短语词汇)</html:option>
          <html:option value="ai">AI 大模型学术翻译</html:option>
        </html:select>
      </html:div>

      <html:div style="display:flex; align-items:center; gap:6px;">
        <html:input type="checkbox" id="cfg-auto-trans" />
        <html:label for="cfg-auto-trans">划词后立即自动翻译</html:label>
      </html:div>

      <html:hr style="border:none; border-top:1px solid var(--pp-border); margin:4px 0;"/>

      <html:div>
        <html:label style="font-weight:600; display:block; margin-bottom:4px;">AI 服务商 / 接口模式:</html:label>
        <html:select id="cfg-ai-provider" style="width:100%; padding:5px; border-radius:4px; border:1px solid var(--pp-border); background:var(--pp-bg); color:var(--pp-text);">
          <html:option value="zhipu">智谱清言 (GLM)</html:option>
          <html:option value="deepseek">DeepSeek</html:option>
          <html:option value="openai">OpenAI (ChatGPT)</html:option>
          <html:option value="moonshot">Moonshot (Kimi)</html:option>
          <html:option value="qwen">通义千问 (Qwen)</html:option>
          <html:option value="siliconflow">硅基流动 (SiliconFlow)</html:option>
          <html:option value="ollama">本地 Ollama</html:option>
          <html:option value="custom">自定义 API 接口 (Custom Endpoint)</html:option>
        </html:select>
      </html:div>

      <html:div>
        <html:label style="font-weight:600; display:block; margin-bottom:4px;">API Key:</html:label>
        <html:input type="password" id="cfg-api-key" placeholder="填入对应服务商的 API Key" style="width:100%; box-sizing:border-box; padding:5px; border-radius:4px; border:1px solid var(--pp-border); background:var(--pp-bg); color:var(--pp-text);" />
      </html:div>

      <html:div>
        <html:label style="font-weight:600; display:block; margin-bottom:4px;">Base URL (API 根地址):</html:label>
        <html:input type="text" id="cfg-base-url" placeholder="https://..." style="width:100%; box-sizing:border-box; padding:5px; border-radius:4px; border:1px solid var(--pp-border); background:var(--pp-bg); color:var(--pp-text);" />
      </html:div>

      <html:div>
        <html:label style="font-weight:600; display:block; margin-bottom:4px;">模型名称 (Model):</html:label>
        <html:input type="text" id="cfg-model" placeholder="e.g. glm-4-flash, deepseek-chat" style="width:100%; box-sizing:border-box; padding:5px; border-radius:4px; border:1px solid var(--pp-border); background:var(--pp-bg); color:var(--pp-text);" />
      </html:div>

      <html:button class="paperpilot-btn primary" id="cfg-btn-save" style="padding:6px; justify-content:center; margin-top:4px;">💾 保存设置</html:button>
      <html:div id="cfg-save-status" style="font-size:11px; color:#16a34a; text-align:center; display:none;">配置已成功保存！</html:div>
    </html:div>
  </html:div>
</html:div>
`;

    let fragment: DocumentFragment;
    if (MozXULElement && typeof MozXULElement.parseXULToFragment === "function") {
      fragment = MozXULElement.parseXULToFragment(markup);
    } else {
      // Robust XML DOMParser fallback for environments where MozXULElement is absent
      const DOMParserClass =
        win?.DOMParser ||
        (typeof DOMParser !== "undefined" ? DOMParser : null) ||
        (globalThis as any).DOMParser;
      if (!DOMParserClass) {
        throw new Error("Neither MozXULElement nor DOMParser is available");
      }
      const parser = new DOMParserClass();
      const parsedDoc = parser.parseFromString(
        `<html:div xmlns:html="${HTML_NS}">${markup}</html:div>`,
        "application/xml"
      );
      fragment = doc.createDocumentFragment();
      const rootNode = parsedDoc.documentElement?.firstChild || parsedDoc.documentElement;
      if (rootNode) {
        fragment.appendChild(rootNode);
      }
    }

    if (fragment.ownerDocument !== doc && typeof doc.importNode === "function") {
      fragment = doc.importNode(fragment, true) as DocumentFragment;
    }

    if (typeof this.container.replaceChildren === "function") {
      this.container.replaceChildren(fragment);
    } else {
      while (this.container.firstChild) {
        this.container.removeChild(this.container.firstChild);
      }
      this.container.appendChild(fragment);
    }

    // Assertions immediately following DOM construction
    const root = this.container.querySelector(".paperpilot-sidebar") as HTMLElement;
    const domain = this.container.querySelector("#pp-domain-select") as HTMLSelectElement;
    const input = this.container.querySelector("#pp-chat-input") as HTMLTextAreaElement;
    const send = this.container.querySelector("#pp-btn-send") as HTMLButtonElement;
    const digest = this.container.querySelector("#pp-btn-digest") as HTMLButtonElement;

    if (!root || !domain || !input || !send || !digest) {
      throw new Error(
        `PaperPilot sidebar DOM incomplete: root=${!!root}, domain=${!!domain}, input=${!!input}, send=${!!send}, digest=${!!digest}`
      );
    }

    if (
      root.namespaceURI !== HTML_NS ||
      domain.namespaceURI !== HTML_NS ||
      input.namespaceURI !== HTML_NS ||
      send.namespaceURI !== HTML_NS
    ) {
      throw new Error(
        `PaperPilot sidebar namespace mismatch: root=${root.namespaceURI}, domain=${domain.namespaceURI}, input=${input.namespaceURI}, send=${send.namespaceURI}`
      );
    }

    dump(`[PaperPilot Sidebar] root namespace=${root.namespaceURI}\n`);
    dump(`[PaperPilot Sidebar] domain constructor=${domain.constructor?.name}\n`);
    dump(`[PaperPilot Sidebar] input constructor=${input.constructor?.name}\n`);
    dump(`[PaperPilot Sidebar] send constructor=${send.constructor?.name}\n`);

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

    if (
      !providerSelect ||
      !transSelect ||
      !autoTransCb ||
      !apiKeyInput ||
      !baseUrlInput ||
      !modelInput ||
      !domainSelect
    ) {
      dump(
        `[PaperPilot Sidebar] ERROR: Controls found: providerSelect=${!!providerSelect}, transSelect=${!!transSelect}, autoTransCb=${!!autoTransCb}, apiKeyInput=${!!apiKeyInput}, baseUrlInput=${!!baseUrlInput}, modelInput=${!!modelInput}, domainSelect=${!!domainSelect}\n`
      );
      throw new Error(
        `PaperPilot settings UI incomplete: providerSelect=${!!providerSelect}, transSelect=${!!transSelect}, autoTransCb=${!!autoTransCb}, apiKeyInput=${!!apiKeyInput}, baseUrlInput=${!!baseUrlInput}, modelInput=${!!modelInput}, domainSelect=${!!domainSelect}`
      );
    }

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

    // Immediate domain synchronization: switching domain in sidebar updates defaultDomain immediately
    domainSelect.addEventListener("change", () => {
      const newDomain = domainSelect.value as DomainType;
      PreferenceManager.set({ defaultDomain: newDomain });
      dump(`[PaperPilot] Default domain dynamically updated to: ${newDomain}\n`);
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
    const doc = this.container.ownerDocument;
    const win = doc.defaultView || (typeof window !== "undefined" ? window : null);

    // Tab switching
    const tabItems = this.container.querySelectorAll(".paperpilot-tab-item");
    tabItems.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabItems.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const tabName = tab.getAttribute("data-tab");

        ["chat", "settings"].forEach((name) => {
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

    // Session switching
    const sessionSelect = this.container.querySelector("#pp-session-select") as HTMLSelectElement;
    sessionSelect?.addEventListener("change", async () => {
      this.pdfHistory.activeSessionId = sessionSelect.value;
      await StorageManager.savePDFHistory(this.pdfHistory);
      const session = this.getActiveSession();
      this.chatView.render(session.messages);
    });

    // New session button
    const newSessionBtn = this.container.querySelector("#pp-btn-new-session");
    newSessionBtn?.addEventListener("click", async () => {
      const newSession = StorageManager.createSession(this.pdfHistory);
      await StorageManager.savePDFHistory(this.pdfHistory);
      this.updateSessionSelectUI();
      this.chatView.render(newSession.messages);
    });

    // Header buttons
    this.container.querySelector("#pp-btn-digest")?.addEventListener("click", () => {
      this.handleGenerateDigest();
    });

    this.container.querySelector("#pp-btn-export")?.addEventListener("click", async () => {
      const activeSession = this.getActiveSession();
      if (!activeSession.messages.length) {
        if (win?.alert) win.alert("当前会话尚无对话记录可导出。");
        else alert("当前会话尚无对话记录可导出。");
        return;
      }
      const ok = await NoteExporter.exportToZoteroNote(
        this.currentParentItemID,
        `${this.currentTitle} (${activeSession.title})`,
        activeSession.messages
      );
      const alertMsg = ok ? "已成功保存为 Zotero 文献笔记！" : "保存笔记失败，请检查条目权限。";
      if (win?.alert) win.alert(alertMsg);
      else alert(alertMsg);
    });

    this.container.querySelector("#pp-btn-clear")?.addEventListener("click", async () => {
      const activeSession = this.getActiveSession();
      const shouldClear = win?.confirm
        ? win.confirm(`确定要清空当前会话【${activeSession.title}】的对话历史吗？`)
        : confirm(`确定要清空当前会话【${activeSession.title}】的对话历史吗？`);

      if (shouldClear) {
        activeSession.messages = [];
        activeSession.lastUpdated = Date.now();
        await StorageManager.savePDFHistory(this.pdfHistory);
        this.chatView.render([]);
      }
    });

    // EventBus fallback listeners (if active)
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
  }

  private switchTab(tabName: string): void {
    const tabItem = this.container.querySelector(`.paperpilot-tab-item[data-tab="${tabName}"]`) as HTMLElement;
    tabItem?.click();
  }

  public setQuote(text: string): void {
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
    const session = this.getActiveSession();
    const userMsg: ChatMessage = {
      id: "u_" + Date.now(),
      role: "user",
      content: content || "请结合论文解读上述选段",
      timestamp: Date.now(),
      selectedQuote: quote,
    };

    session.messages.push(userMsg);
    session.lastUpdated = Date.now();
    this.chatView.appendMessage(userMsg);
    await StorageManager.savePDFHistory(this.pdfHistory);

    const aiMsgId = "a_" + Date.now();
    const aiMsg: ChatMessage = {
      id: aiMsgId,
      role: "assistant",
      content: "正在结合论文检索上下文并思考中...",
      timestamp: Date.now(),
    };
    session.messages.push(aiMsg);
    this.chatView.appendMessage(aiMsg);

    // Retrieve relevant context from PDF full text with intent awareness
    let relevantContext = "";
    if (this.currentAttachmentID) {
      try {
        relevantContext = await PaperContextService.getRelevantContext(
          this.currentAttachmentID,
          content,
          quote
        );
      } catch (ctxErr) {
        dump(`[PaperPilot] Paper context retrieval failed: ${ctxErr}. Proceeding with quote & question...\n`);
      }
    }

    let systemPrompt = `你是一位专业高效的学术伴读助手 PaperPilot。\n针对用户的提问或论文选段，给出清晰、严谨、有学术洞见的解答。`;

    if (relevantContext) {
      systemPrompt += `\n\n【论文相关原文段落参考】:\n${relevantContext}\n\n回答准则: 优先解答用户提问及所选引文，结合上述论文真实上下文进行分析推导。无法从论文支持的内容严禁臆造。`;
    }

    const messagesPayload: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];

    // Append chat history strictly from ACTIVE session (last 6 messages)
    for (const m of session.messages.slice(-6)) {
      if (m.id === aiMsgId) break;
      let text = m.content;
      if (m.selectedQuote) {
        text = `【用户引用选段】: ${m.selectedQuote}\n${text}`;
      }
      messagesPayload.push({ role: m.role, content: text });
    }

    try {
      let fullResponse = "";
      await AIClient.chat(messagesPayload, {
        onChunk: (delta, accumulated) => {
          fullResponse = accumulated;
          this.chatView.appendStreamingDelta(aiMsgId, delta);
        },
      });

      aiMsg.content = fullResponse;
      this.chatView.finishStreamingMessage(aiMsgId, fullResponse);
      session.lastUpdated = Date.now();
      await StorageManager.savePDFHistory(this.pdfHistory);
    } catch (e: any) {
      aiMsg.content = `❌ 出错: ${e.message || e}`;
      this.chatView.updateStreamingMessage(aiMsgId, aiMsg.content);
      session.lastUpdated = Date.now();
      await StorageManager.savePDFHistory(this.pdfHistory);
    }
  }

  private async handleInterpret(text: string, domain: DomainType): Promise<void> {
    const session = this.getActiveSession();
    const promptConfig = DOMAIN_PROMPTS[domain];
    const userMsg: ChatMessage = {
      id: "u_" + Date.now(),
      role: "user",
      content: `请求对所选句段进行【${promptConfig.name}】专业解读`,
      timestamp: Date.now(),
      selectedQuote: text,
      domain: promptConfig.badge,
    };

    session.messages.push(userMsg);
    session.lastUpdated = Date.now();
    this.chatView.appendMessage(userMsg);
    await StorageManager.savePDFHistory(this.pdfHistory);

    const aiMsgId = "a_" + Date.now();
    const aiMsg: ChatMessage = {
      id: aiMsgId,
      role: "assistant",
      content: "正在深度解读中...",
      timestamp: Date.now(),
      domain: promptConfig.badge,
    };
    session.messages.push(aiMsg);
    this.chatView.appendMessage(aiMsg);

    const messages = PromptManager.buildInterpretationMessages(text, domain);

    try {
      let fullResponse = "";
      await AIClient.chat(messages, {
        onChunk: (delta, accumulated) => {
          fullResponse = accumulated;
          this.chatView.appendStreamingDelta(aiMsgId, delta);
        },
      });

      aiMsg.content = fullResponse;
      this.chatView.finishStreamingMessage(aiMsgId, fullResponse);
      session.lastUpdated = Date.now();
      await StorageManager.savePDFHistory(this.pdfHistory);
    } catch (e: any) {
      aiMsg.content = `❌ 解读失败: ${e.message || e}`;
      this.chatView.updateStreamingMessage(aiMsgId, aiMsg.content);
      session.lastUpdated = Date.now();
      await StorageManager.savePDFHistory(this.pdfHistory);
    }
  }

  private async handleGenerateDigest(): Promise<void> {
    this.switchTab("chat");
    const session = this.getActiveSession();
    const userMsg: ChatMessage = {
      id: "u_" + Date.now(),
      role: "user",
      content: "请为这篇论文生成一键全文精读报告",
      timestamp: Date.now(),
    };
    session.messages.push(userMsg);
    session.lastUpdated = Date.now();
    this.chatView.appendMessage(userMsg);
    await StorageManager.savePDFHistory(this.pdfHistory);

    const aiMsgId = "a_" + Date.now();
    const aiMsg: ChatMessage = {
      id: aiMsgId,
      role: "assistant",
      content: "正在分析 PDF 全文结构...",
      timestamp: Date.now(),
      domain: "全文精读",
    };
    session.messages.push(aiMsg);
    this.chatView.appendMessage(aiMsg);

    try {
      let fullResponse = "";
      await PaperDigestService.generateDigest({
        title: this.currentTitle,
        attachmentID: this.currentAttachmentID,
        onProgress: (status) => {
          this.chatView.updateStreamingMessage(aiMsgId, `*${status}*`);
        },
        onChunk: (delta, accumulated) => {
          fullResponse = accumulated;
          this.chatView.appendStreamingDelta(aiMsgId, delta);
        },
      });

      aiMsg.content = fullResponse;
      this.chatView.finishStreamingMessage(aiMsgId, fullResponse);
      session.lastUpdated = Date.now();
      await StorageManager.savePDFHistory(this.pdfHistory);
    } catch (e: any) {
      aiMsg.content = `❌ 生成报告失败: ${e.message || e}`;
      this.chatView.updateStreamingMessage(aiMsgId, aiMsg.content);
      session.lastUpdated = Date.now();
      await StorageManager.savePDFHistory(this.pdfHistory);
    }
  }
}
