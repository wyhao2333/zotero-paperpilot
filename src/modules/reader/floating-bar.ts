import { SelectionHelper } from "./selection";
import { EventBus } from "../../core/event-bus";
import { TranslatorManager } from "../translator";
import { PreferenceManager } from "../../core/preferences";
import { PromptManager } from "../ai/prompts";
import { AIClient } from "../ai/client";
import { PaperPilotSidebarController } from "../sidebar/controller";
import { PaperContextService } from "./paper-context";

export class FloatingBarManager {
  private static activeFloatingBar: HTMLElement | null = null;

  /**
   * 1. Official Zotero Reader selection popup hook (PRIMARY PATH)
   * Integrates PaperPilot buttons and inline result area directly inside Zotero's native .selection-popup
   */
  static handleNativeSelectionPopup(event: any): void {
    try {
      dump("[PaperPilot] selection popup event received\n");
      const { reader, doc, params, append } = event;
      if (!doc) return;

      const rawText =
        params?.annotation?.text ||
        (typeof reader?.getSelectedText === "function" ? reader.getSelectedText() : "") ||
        "";
      const cleanText = SelectionHelper.cleanPdfText(rawText);

      if (!cleanText || cleanText.length < 1) return;

      const instanceID =
        (reader?._instanceID ? String(reader._instanceID) : null) ||
        (reader?.itemID ? String(reader.itemID) : null) ||
        Math.random().toString(36).substring(2, 8);

      const nativePopup = doc.querySelector(".selection-popup") as HTMLElement;
      if (nativePopup) {
        nativePopup.style.maxWidth = "none";
      }

      // Remove any previously injected PaperPilot UI in this popup
      const existing =
        doc.querySelector(`#paperpilot-popup-wrapper-${instanceID}`) ||
        doc.querySelector(".paperpilot-selection-wrapper");
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }

      // Main wrapper appended directly to native selection popup
      const wrapper = doc.createElement("div");
      wrapper.id = `paperpilot-popup-wrapper-${instanceID}`;
      wrapper.className = "paperpilot-selection-wrapper";
      wrapper.style.cssText = `
        display: flex !important;
        flex-direction: column !important;
        border-top: 1px solid rgba(128, 128, 128, 0.25) !important;
        margin-top: 4px !important;
        padding-top: 4px !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        font-size: 12px !important;
      `;

      // Button row
      const btnRow = doc.createElement("div");
      btnRow.className = "paperpilot-btn-group";
      btnRow.style.cssText = `
        display: inline-flex !important;
        align-items: center !important;
        gap: 4px !important;
      `;

      // 1. Translate Button
      const btnTrans = doc.createElement("button");
      btnTrans.textContent = "🌐 翻译";
      btnTrans.id = `paperpilot-${instanceID}-translate`;
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
      `;

      // 2. Interpret Button
      const btnInterpret = doc.createElement("button");
      btnInterpret.textContent = "💡 解读";
      btnInterpret.id = `paperpilot-${instanceID}-interpret`;
      btnInterpret.title = "PaperPilot 学术解读 (直接在浮窗显示)";
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
      `;

      // 3. Ask Button
      const btnAsk = doc.createElement("button");
      btnAsk.textContent = "❓ 提问";
      btnAsk.id = `paperpilot-${instanceID}-ask`;
      btnAsk.title = "将选段带入 PaperPilot 伴读侧边栏问答";
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
      `;

      btnRow.appendChild(btnTrans);
      btnRow.appendChild(btnInterpret);
      btnRow.appendChild(btnAsk);
      wrapper.appendChild(btnRow);

      // Inline Result Area (hidden by default)
      const resultCard = doc.createElement("div");
      resultCard.id = `paperpilot-${instanceID}-result`;
      resultCard.className = "paperpilot-inline-result";
      resultCard.style.cssText = `
        display: none;
        margin-top: 6px !important;
        padding-top: 6px !important;
        border-top: 1px dashed rgba(128, 128, 128, 0.25) !important;
        max-width: 380px !important;
        width: 100% !important;
      `;

      resultCard.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; font-size:11px; color:#64748b; font-weight:600;">
          <span id="pp-res-title-${instanceID}">PaperPilot · 结果</span>
          <div style="display:flex; gap:6px;">
            <button id="pp-res-copy-${instanceID}" style="background:transparent; border:none; color:#2563eb; cursor:pointer; font-size:11px; padding:0;">📋 复制</button>
            <button id="pp-res-close-${instanceID}" style="background:transparent; border:none; color:#94a3b8; cursor:pointer; font-size:11px; padding:0 2px;">✕</button>
          </div>
        </div>
        <div id="pp-res-body-${instanceID}" style="max-height:180px; overflow-y:auto; word-break:break-word; font-size:12px; line-height:1.5; color:#1e293b;"></div>
      `;
      wrapper.appendChild(resultCard);

      // Append into native popup via official callback or DOM fallback
      if (typeof append === "function") {
        append(wrapper);
      } else if (nativePopup) {
        nativePopup.appendChild(wrapper);
      }

      // Safe Clipboard Copy Helper
      const copyToClipboard = (textToCopy: string, copyBtn: HTMLButtonElement | null) => {
        const nav = doc.defaultView?.navigator || (typeof navigator !== "undefined" ? navigator : null);
        if (nav?.clipboard?.writeText) {
          nav.clipboard.writeText(textToCopy).catch(() => {});
        } else if (typeof Zotero !== "undefined" && (Zotero as any).Utilities?.copyTextToClipboard) {
          (Zotero as any).Utilities.copyTextToClipboard(textToCopy);
        } else {
          try {
            const el = doc.createElement("textarea");
            el.value = textToCopy;
            doc.body.appendChild(el);
            el.select();
            doc.execCommand("copy");
            doc.body.removeChild(el);
          } catch (e) {}
        }
        if (copyBtn) {
          copyBtn.textContent = "已复制!";
          setTimeout(() => (copyBtn.textContent = "📋 复制"), 1500);
        }
      };

      const titleEl = resultCard.querySelector(`#pp-res-title-${instanceID}`) as HTMLElement;
      const bodyEl = resultCard.querySelector(`#pp-res-body-${instanceID}`) as HTMLElement;
      const copyBtn = resultCard.querySelector(`#pp-res-copy-${instanceID}`) as HTMLButtonElement;
      const closeBtn = resultCard.querySelector(`#pp-res-close-${instanceID}`) as HTMLButtonElement;

      closeBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        resultCard.style.display = "none";
      });

      copyBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        const content = bodyEl?.innerText || bodyEl?.textContent || "";
        copyToClipboard(content, copyBtn);
      });

      // 1. Translate action
      btnTrans.addEventListener("click", async (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        resultCard.style.display = "block";
        if (titleEl) titleEl.textContent = "PaperPilot · 划词翻译";
        if (bodyEl) bodyEl.innerHTML = "<em>正在翻译...</em>";

        try {
          const translated = await TranslatorManager.translate(cleanText);
          if (bodyEl) bodyEl.textContent = translated;
          EventBus.emit("action:translated", { source: cleanText, translated });
        } catch (err: any) {
          if (bodyEl) {
            bodyEl.innerHTML = `<span style="color:#dc2626;">❌ 翻译失败: ${err.message || err}</span>`;
          }
        }
      });

      // 2. Interpret action (inline in popup)
      btnInterpret.addEventListener("click", async (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        resultCard.style.display = "block";
        if (titleEl) titleEl.textContent = "PaperPilot · 学术解读";
        if (bodyEl) bodyEl.innerHTML = "<em>正在进行学术解读...</em>";

        const config = PreferenceManager.getActiveAIConfig();
        if (!config || (!config.apiKey && config.id !== "ollama")) {
          if (bodyEl) {
            bodyEl.innerHTML = `
              <div style="color:#b45309; line-height:1.5;">
                <strong>未配置 AI API Key</strong><br/>
                请前往 Zotero【设置】→【PaperPilot】中配置服务商与 API Key。
              </div>`;
          }
          return;
        }

        try {
          const messages = PromptManager.buildInterpretationMessages(cleanText);
          let full = "";
          await AIClient.chat(messages, {
            onChunk: (_delta, accumulated) => {
              full = accumulated;
              if (bodyEl) bodyEl.textContent = accumulated;
            },
          });
          if (bodyEl && full) {
            bodyEl.textContent = full;
          }
          EventBus.emit("action:interpreted", { source: cleanText, text: full });
        } catch (err: any) {
          if (bodyEl) {
            bodyEl.innerHTML = `<span style="color:#dc2626;">❌ 解读失败: ${err.message || err}</span>`;
          }
        }
      });

      // 3. Ask action (delegates to sidebar)
      btnAsk.addEventListener("click", async (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const origText = btnAsk.textContent;
        btnAsk.textContent = "已发送到 PaperPilot →";
        setTimeout(() => {
          btnAsk.textContent = origText || "❓ 提问";
        }, 2000);

        const attachmentID = await PaperContextService.resolveAttachmentID(reader);
        await PaperPilotSidebarController.openAsk({
          selectedText: cleanText,
          reader,
          attachmentID: attachmentID || undefined,
        });
      });

      // Auto-translate if enabled
      if (PreferenceManager.get().autoTranslateSelection) {
        setTimeout(() => {
          btnTrans.click();
        }, 120);
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

          // If native popup exists and is visible, do not show duplicate bar
          const nativePopup = doc.querySelector(".selection-popup") as HTMLElement;
          if (nativePopup && nativePopup.offsetWidth > 0) {
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
      if (this.activeFloatingBar && this.activeFloatingBar.contains(e.target as Node)) {
        return;
      }
      this.hideBar();
    });
  }

  static showStandaloneFloatingBar(doc: Document, rect: DOMRect, text: string): void {
    if (doc.querySelector(".paperpilot-selection-wrapper")) {
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

    bar.querySelector("#pp-fb-trans")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const btn = bar.querySelector("#pp-fb-trans") as HTMLButtonElement;
      if (btn) btn.textContent = "翻译中...";
      try {
        const trans = await TranslatorManager.translate(text);
        alert(`【PaperPilot 译文】\n${trans}`);
      } catch (err: any) {
        alert(`翻译失败: ${err.message || err}`);
      }
      this.hideBar();
    });

    bar.querySelector("#pp-fb-interpret")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hideBar();
      PaperPilotSidebarController.openInterpret({ selectedText: text });
    });

    bar.querySelector("#pp-fb-ask")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hideBar();
      PaperPilotSidebarController.openAsk({ selectedText: text });
    });
  }

  static hideBar(): void {
    if (this.activeFloatingBar && this.activeFloatingBar.parentNode) {
      this.activeFloatingBar.parentNode.removeChild(this.activeFloatingBar);
      this.activeFloatingBar = null;
    }
  }

  static hide(): void {
    this.hideBar();
  }
}
