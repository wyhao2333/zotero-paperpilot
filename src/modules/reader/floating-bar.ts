import { SelectionHelper } from "./selection";
import { EventBus } from "../../core/event-bus";
import { TranslatorManager } from "../translator";
import { PreferenceManager } from "../../core/preferences";

export class FloatingBarManager {
  private static activePopup: HTMLElement | null = null;

  /**
   * Called by Zotero.Reader.registerEventListener("renderTextSelectionPopup", ...)
   */
  static handleNativeSelectionPopup(event: any): void {
    const { reader, doc, params, append } = event;
    if (!doc) return;

    const rawText = params?.annotation?.text || (reader?.getSelectedText ? reader.getSelectedText() : "");
    const cleanText = SelectionHelper.cleanPdfText(rawText);

    if (!cleanText || cleanText.length < 2) return;

    // Create a compact PaperPilot action group to append into the native popup
    const btnGroup = doc.createElement("div");
    btnGroup.className = "paperpilot-native-popup-group";
    btnGroup.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 3px;
      margin-left: 6px;
      padding: 2px 4px;
      border-left: 1px solid rgba(128,128,128,0.3);
      vertical-align: middle;
    `;

    // 1. Translate Button
    const btnTranslate = doc.createElement("button");
    btnTranslate.textContent = "🌐 翻译";
    btnTranslate.title = "PaperPilot 划词翻译";
    btnTranslate.style.cssText = `
      background: #2563eb;
      color: #ffffff;
      border: none;
      border-radius: 4px;
      padding: 2px 7px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      line-height: 18px;
    `;

    // 2. Interpret Button
    const btnInterpret = doc.createElement("button");
    btnInterpret.textContent = "💡 解读";
    btnInterpret.title = "PaperPilot 领域深度解读";
    btnInterpret.style.cssText = `
      background: #f1f5f9;
      color: #1e293b;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 2px 7px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      line-height: 18px;
    `;

    // 3. Ask Button
    const btnAsk = doc.createElement("button");
    btnAsk.textContent = "❓ 提问";
    btnAsk.title = "基于选段向 AI 提问";
    btnAsk.style.cssText = `
      background: #f1f5f9;
      color: #1e293b;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 2px 7px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      line-height: 18px;
    `;

    btnGroup.appendChild(btnTranslate);
    btnGroup.appendChild(btnInterpret);
    btnGroup.appendChild(btnAsk);

    // Append to native popup
    if (typeof append === "function") {
      append(btnGroup);
    }

    // Actions
    btnTranslate.addEventListener("click", async (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      await this.showTranslationPopup(doc, cleanText, btnTranslate);
    });

    btnInterpret.addEventListener("click", (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      this.hidePopup();
      EventBus.emit("action:interpret", { text: cleanText });
    });

    btnAsk.addEventListener("click", (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      this.hidePopup();
      EventBus.emit("action:ask", { quote: cleanText });
    });

    // Auto-translate if user enabled it
    if (PreferenceManager.get().autoTranslateSelection) {
      setTimeout(() => {
        this.showTranslationPopup(doc, cleanText, btnTranslate);
      }, 100);
    }
  }

  static async showTranslationPopup(doc: Document, text: string, anchorEl: HTMLElement): Promise<void> {
    this.hidePopup();

    const popup = doc.createElement("div");
    popup.className = "paperpilot-popup-card";
    popup.style.cssText = `
      position: absolute;
      z-index: 999999;
      width: 320px;
      max-width: 90vw;
      background: #ffffff;
      color: #1e293b;
      border: 1px solid #cbd5e1;
      box-shadow: 0 8px 24px rgba(0,0,0,0.18);
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 13px;
      line-height: 1.5;
    `;

    // Position popup below anchor button
    const rect = anchorEl.getBoundingClientRect();
    const top = rect.bottom + 8 + (doc.documentElement.scrollTop || doc.body.scrollTop || 0);
    const left = Math.max(10, Math.min(rect.left, doc.documentElement.clientWidth - 340));

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;

    popup.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin-bottom:6px; font-weight:600; font-size:11px; color:#64748b;">
        <span>PaperPilot 译文</span>
        <div style="display:flex; gap:6px;">
          <button id="pp-popup-copy" style="background:transparent; border:none; color:#2563eb; cursor:pointer; font-size:11px;">📋 复制</button>
          <button id="pp-popup-close" style="background:transparent; border:none; color:#94a3b8; cursor:pointer; font-size:12px; font-weight:bold;">✕</button>
        </div>
      </div>
      <div id="pp-popup-body" style="max-height:180px; overflow-y:auto; word-break:break-word;">
        <em>正在翻译中...</em>
      </div>
    `;

    doc.body.appendChild(popup);
    this.activePopup = popup;

    popup.querySelector("#pp-popup-close")?.addEventListener("click", () => {
      this.hidePopup();
    });

    try {
      const translated = await TranslatorManager.translate(text);
      const bodyEl = popup.querySelector("#pp-popup-body");
      if (bodyEl) {
        bodyEl.textContent = translated;
      }

      popup.querySelector("#pp-popup-copy")?.addEventListener("click", () => {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(translated);
          const copyBtn = popup.querySelector("#pp-popup-copy") as HTMLButtonElement;
          if (copyBtn) {
            copyBtn.textContent = "已复制!";
            setTimeout(() => (copyBtn.textContent = "📋 复制"), 1500);
          }
        }
      });

      EventBus.emit("action:translated", { source: text, translated });
    } catch (err: any) {
      const bodyEl = popup.querySelector("#pp-popup-body");
      if (bodyEl) {
        bodyEl.textContent = `翻译失败: ${err.message || err}`;
      }
    }
  }

  static hidePopup(): void {
    if (this.activePopup && this.activePopup.parentNode) {
      this.activePopup.parentNode.removeChild(this.activePopup);
      this.activePopup = null;
    }
  }

  static hide(): void {
    this.hidePopup();
  }
}
