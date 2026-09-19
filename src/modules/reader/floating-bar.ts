import { SelectionHelper } from "./selection";
import { EventBus } from "../../core/event-bus";
import { TranslatorManager } from "../translator";
import { PreferenceManager } from "../../core/preferences";

export class FloatingBarManager {
  private static activePopup: HTMLElement | null = null;
  private static activeFloatingBar: HTMLElement | null = null;

  /**
   * 1. Official Zotero Reader selection popup hook (PRIMARY PATH)
   */
  static handleNativeSelectionPopup(event: any): void {
    try {
      dump("[PaperPilot] native selection popup event received\n");
      const { reader, doc, params, append } = event;
      if (!doc) return;

      // Primary source: params.annotation.text; Secondary fallback: reader.getSelectedText()
      const rawText =
        params?.annotation?.text ||
        (typeof reader?.getSelectedText === "function" ? reader.getSelectedText() : "") ||
        "";
      const cleanText = SelectionHelper.cleanPdfText(rawText);

      if (!cleanText || cleanText.length < 1) return;

      dump(`[PaperPilot] native selection text received, length=${cleanText.length}\n`);

      // Remove any previously injected button group to always bind fresh selection
      const existing = doc.querySelector(".paperpilot-btn-group");
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }

      const btnGroup = doc.createElement("div");
      btnGroup.className = "paperpilot-btn-group";
      btnGroup.style.cssText = `
        display: inline-flex !important;
        align-items: center !important;
        gap: 3px !important;
        margin-left: 6px !important;
        padding-left: 6px !important;
        border-left: 1px solid rgba(128,128,128,0.3) !important;
        vertical-align: middle !important;
        height: 24px !important;
      `;

      // 1. Translate Button
      const btnTrans = doc.createElement("button");
      btnTrans.textContent = "🌐 翻译";
      btnTrans.id = "paperpilot-btn-translate";
      btnTrans.title = "PaperPilot 划词翻译";
      btnTrans.style.cssText = `
        background: #2563eb !important;
        color: #ffffff !important;
        border: none !important;
        border-radius: 4px !important;
        padding: 2px 7px !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        cursor: pointer !important;
        line-height: 18px !important;
        display: inline-block !important;
      `;

      // 2. Interpret Button
      const btnInterpret = doc.createElement("button");
      btnInterpret.textContent = "💡 解读";
      btnInterpret.id = "paperpilot-btn-interpret";
      btnInterpret.title = "PaperPilot 领域学术解读";
      btnInterpret.style.cssText = `
        background: #f1f5f9 !important;
        color: #1e293b !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 4px !important;
        padding: 2px 7px !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        cursor: pointer !important;
        line-height: 18px !important;
        display: inline-block !important;
      `;

      // 3. Ask Button
      const btnAsk = doc.createElement("button");
      btnAsk.textContent = "❓ 提问";
      btnAsk.id = "paperpilot-btn-ask";
      btnAsk.title = "基于选段向 AI 提问";
      btnAsk.style.cssText = `
        background: #f1f5f9 !important;
        color: #1e293b !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 4px !important;
        padding: 2px 7px !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        cursor: pointer !important;
        line-height: 18px !important;
        display: inline-block !important;
      `;

      btnGroup.appendChild(btnTrans);
      btnGroup.appendChild(btnInterpret);
      btnGroup.appendChild(btnAsk);

      // Append via official Zotero API
      if (typeof append === "function") {
        append(btnGroup);
      } else {
        const nativePopup = doc.querySelector(".selection-popup") as HTMLElement;
        if (nativePopup) {
          nativePopup.appendChild(btnGroup);
        }
      }

      // Event handlers
      btnTrans.addEventListener("click", async (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        await this.showTranslationPopup(doc, cleanText, btnTrans);
      });

      btnInterpret.addEventListener("click", (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        btnInterpret.textContent = "已发送解读 ✓";
        setTimeout(() => {
          btnInterpret.textContent = "💡 解读";
        }, 2000);

        if (reader) {
          if (typeof reader.setRightSidebarOpen === "function") {
            reader.setRightSidebarOpen(true);
          } else if (typeof reader.openRightSidebar === "function") {
            reader.openRightSidebar();
          }
        }
        EventBus.emit("action:interpret", { text: cleanText });
      });

      btnAsk.addEventListener("click", (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        btnAsk.textContent = "已置入提问 ✓";
        setTimeout(() => {
          btnAsk.textContent = "❓ 提问";
        }, 2000);

        if (reader) {
          if (typeof reader.setRightSidebarOpen === "function") {
            reader.setRightSidebarOpen(true);
          } else if (typeof reader.openRightSidebar === "function") {
            reader.openRightSidebar();
          }
        }
        EventBus.emit("action:ask", { quote: cleanText });
      });

      // Auto-translate if enabled in preferences
      if (PreferenceManager.get().autoTranslateSelection) {
        setTimeout(() => {
          this.showTranslationPopup(doc, cleanText, btnTrans);
        }, 150);
      }
    } catch (err) {
      dump(`[PaperPilot] Error in handleNativeSelectionPopup: ${err}\n`);
    }
  }

  /**
   * 2. Fallback reader selection listener attached to reader document
   */
  static attachToReaderDocument(doc: Document, win: Window): void {
    if (!doc || !doc.body) return;

    doc.addEventListener("mouseup", (e: MouseEvent) => {
      setTimeout(() => {
        try {
          const sel = win.getSelection();
          const rawText = sel ? sel.toString() : "";
          const cleanText = SelectionHelper.cleanPdfText(rawText);

          if (!cleanText || cleanText.length < 2) {
            return;
          }

          dump(`[PaperPilot] fallback selection detected, length=${cleanText.length}\n`);

          if (this.activePopup && this.activePopup.contains(e.target as Node)) {
            return;
          }

          const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
          if (!range) return;

          const rect = range.getBoundingClientRect();
          this.showStandaloneFloatingBar(doc, rect, cleanText);
        } catch (err) {
          dump(`[PaperPilot] mouseup handler error: ${err}\n`);
        }
      }, 80);
    });

    doc.addEventListener("mousedown", (e: MouseEvent) => {
      if (
        (this.activePopup && this.activePopup.contains(e.target as Node)) ||
        (this.activeFloatingBar && this.activeFloatingBar.contains(e.target as Node))
      ) {
        return;
      }
      this.hide();
    });
  }

  static showStandaloneFloatingBar(doc: Document, rect: DOMRect, text: string): void {
    // Only show if native popup does NOT already contain PaperPilot UI
    if (doc.querySelector(".paperpilot-btn-group")) {
      return;
    }
    const nativePopup = doc.querySelector(".selection-popup");
    if (nativePopup && (nativePopup as HTMLElement).offsetWidth > 0) {
      return;
    }

    this.hideBar();

    const bar = doc.createElement("div");
    bar.className = "paperpilot-floating-bar";
    bar.style.cssText = `
      position: fixed !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      gap: 4px !important;
      background: #ffffff !important;
      border: 1px solid #cbd5e1 !important;
      box-shadow: 0 4px 16px rgba(0,0,0,0.18) !important;
      border-radius: 6px !important;
      padding: 3px 6px !important;
    `;

    const top = Math.max(10, rect.top - 38);
    const left = Math.max(10, rect.left + rect.width / 2 - 80);

    bar.style.top = `${top}px`;
    bar.style.left = `${left}px`;

    bar.innerHTML = `
      <button id="pp-fb-trans" style="background:#2563eb; color:#fff; border:none; border-radius:4px; padding:2px 8px; font-size:12px; font-weight:500; cursor:pointer;">🌐 翻译</button>
      <button id="pp-fb-interpret" style="background:#f1f5f9; color:#1e293b; border:1px solid #cbd5e1; border-radius:4px; padding:2px 8px; font-size:12px; font-weight:500; cursor:pointer;">💡 解读</button>
      <button id="pp-fb-ask" style="background:#f1f5f9; color:#1e293b; border:1px solid #cbd5e1; border-radius:4px; padding:2px 8px; font-size:12px; font-weight:500; cursor:pointer;">❓ 提问</button>
    `;

    doc.body.appendChild(bar);
    this.activeFloatingBar = bar;

    bar.querySelector("#pp-fb-trans")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showTranslationPopup(doc, text, bar);
    });

    bar.querySelector("#pp-fb-interpret")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hide();
      EventBus.emit("action:interpret", { text });
    });

    bar.querySelector("#pp-fb-ask")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hide();
      EventBus.emit("action:ask", { quote: text });
    });
  }

  static async showTranslationPopup(doc: Document, text: string, anchorEl: HTMLElement): Promise<void> {
    this.hidePopup();

    const popup = doc.createElement("div");
    popup.className = "paperpilot-popup-card";
    popup.style.cssText = `
      position: fixed !important;
      z-index: 2147483647 !important;
      width: 320px !important;
      max-width: 90vw !important;
      background: #ffffff !important;
      color: #1e293b !important;
      border: 1px solid #cbd5e1 !important;
      box-shadow: 0 8px 24px rgba(0,0,0,0.18) !important;
      border-radius: 8px !important;
      padding: 10px 12px !important;
      font-size: 13px !important;
      line-height: 1.5 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif !important;
    `;

    const rect = anchorEl.getBoundingClientRect();
    const win = doc.defaultView || (typeof window !== "undefined" ? window : null);
    const viewWidth = win?.innerWidth || 800;
    const viewHeight = win?.innerHeight || 600;

    let top = rect.bottom + 8;
    if (top + 200 > viewHeight) {
      top = Math.max(10, rect.top - 210);
    }
    const left = Math.max(10, Math.min(rect.left, viewWidth - 340));

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

    // Append UI first - ensures UI appears regardless of network outcome
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
      // Clear human-readable error display - UI never vanishes
      const bodyEl = popup.querySelector("#pp-popup-body");
      if (bodyEl) {
        bodyEl.innerHTML = `<span style="color: #dc2626; font-weight: 500;">❌ 翻译失败:</span> <span style="color: #64748b;">${err.message || err}</span>`;
      }
    }
  }

  static hidePopup(): void {
    if (this.activePopup && this.activePopup.parentNode) {
      this.activePopup.parentNode.removeChild(this.activePopup);
      this.activePopup = null;
    }
  }

  static hideBar(): void {
    if (this.activeFloatingBar && this.activeFloatingBar.parentNode) {
      this.activeFloatingBar.parentNode.removeChild(this.activeFloatingBar);
      this.activeFloatingBar = null;
    }
  }

  static hide(): void {
    this.hidePopup();
    this.hideBar();
  }
}
