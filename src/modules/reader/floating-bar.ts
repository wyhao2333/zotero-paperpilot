import { SelectionHelper } from "./selection";
import { EventBus } from "../../core/event-bus";
import { TranslatorManager } from "../translator";
import { PreferenceManager } from "../../core/preferences";

export class FloatingBarManager {
  private static activeBar: HTMLElement | null = null;
  private static activePopup: HTMLElement | null = null;

  static attachToReaderWindow(readerWin: Window, doc: Document): void {
    if (!doc || !doc.body) return;

    doc.addEventListener("mouseup", async (e: MouseEvent) => {
      // Delay slightly for selection to settle
      setTimeout(async () => {
        const sel = readerWin.getSelection();
        const rawText = sel ? sel.toString() : "";
        const cleanText = SelectionHelper.cleanPdfText(rawText);

        if (!cleanText || cleanText.length < 2) {
          this.hide();
          return;
        }

        // If click was inside our own floating bar or popup, do not reposition
        if (
          (this.activeBar && this.activeBar.contains(e.target as Node)) ||
          (this.activePopup && this.activePopup.contains(e.target as Node))
        ) {
          return;
        }

        const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
        if (!range) return;

        const rect = range.getBoundingClientRect();
        this.show(doc, rect, cleanText);

        // Check if auto-translate is enabled
        if (PreferenceManager.get().autoTranslateSelection) {
          this.triggerTranslate(doc, rect, cleanText);
        }
      }, 50);
    });

    doc.addEventListener("mousedown", (e: MouseEvent) => {
      if (
        (this.activeBar && this.activeBar.contains(e.target as Node)) ||
        (this.activePopup && this.activePopup.contains(e.target as Node))
      ) {
        return;
      }
      this.hide();
    });
  }

  static show(doc: Document, rect: DOMRect, text: string): void {
    this.hideBar();

    const bar = doc.createElement("div");
    bar.className = "paperpilot-floating-bar";

    const top = Math.max(10, rect.top - 42 + doc.documentElement.scrollTop);
    const left = Math.max(10, rect.left + rect.width / 2 - 110 + doc.documentElement.scrollLeft);

    bar.style.top = `${top}px`;
    bar.style.left = `${left}px`;

    bar.innerHTML = `
      <button class="paperpilot-btn primary" id="pp-btn-translate">🌐 翻译</button>
      <button class="paperpilot-btn" id="pp-btn-interpret">💡 解读</button>
      <button class="paperpilot-btn" id="pp-btn-ask">❓ 提问</button>
    `;

    doc.body.appendChild(bar);
    this.activeBar = bar;

    bar.querySelector("#pp-btn-translate")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.triggerTranslate(doc, rect, text);
    });

    bar.querySelector("#pp-btn-interpret")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hide();
      EventBus.emit("action:interpret", { text });
    });

    bar.querySelector("#pp-btn-ask")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hide();
      EventBus.emit("action:ask", { quote: text });
    });
  }

  static async triggerTranslate(doc: Document, rect: DOMRect, text: string): Promise<void> {
    this.showPopup(doc, rect, "正在翻译中...", text);

    try {
      const translated = await TranslatorManager.translate(text);
      this.showPopup(doc, rect, translated, text);
      EventBus.emit("action:translated", { source: text, translated });
    } catch (err: any) {
      this.showPopup(doc, rect, `翻译失败: ${err.message || err}`, text);
    }
  }

  static showPopup(doc: Document, rect: DOMRect, content: string, sourceText: string): void {
    this.hidePopup();

    const popup = doc.createElement("div");
    popup.className = "paperpilot-popup-card";

    const top = rect.bottom + 10 + doc.documentElement.scrollTop;
    const left = Math.max(10, Math.min(rect.left + doc.documentElement.scrollLeft, doc.documentElement.clientWidth - 340));

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;

    popup.innerHTML = `
      <div class="paperpilot-card-header">
        <span>PaperPilot 翻译</span>
        <button class="paperpilot-btn" id="pp-btn-copy" style="padding:2px 6px; font-size:11px;">📋 复制</button>
      </div>
      <div class="paperpilot-card-body">${this.escapeHtml(content)}</div>
    `;

    popup.querySelector("#pp-btn-copy")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(content);
      }
      const copyBtn = popup.querySelector("#pp-btn-copy") as HTMLButtonElement;
      if (copyBtn) {
        copyBtn.textContent = "已复制!";
        setTimeout(() => (copyBtn.textContent = "📋 复制"), 1500);
      }
    });

    doc.body.appendChild(popup);
    this.activePopup = popup;
  }

  static hideBar(): void {
    if (this.activeBar && this.activeBar.parentNode) {
      this.activeBar.parentNode.removeChild(this.activeBar);
      this.activeBar = null;
    }
  }

  static hidePopup(): void {
    if (this.activePopup && this.activePopup.parentNode) {
      this.activePopup.parentNode.removeChild(this.activePopup);
      this.activePopup = null;
    }
  }

  static hide(): void {
    this.hideBar();
    this.hidePopup();
  }

  private static escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
