import { ChatMessage } from "../../types/zotero";

export class ChatView {
  private container: HTMLElement;
  private streamingTextNodes: Map<string, Text> = new Map();
  private scrollTimer: any = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(messages: ChatMessage[]): void {
    this.container.innerHTML = "";
    this.streamingTextNodes.clear();
    for (const msg of messages) {
      this.appendMessage(msg, false);
    }
    this.scrollToBottom();
  }

  appendMessage(msg: ChatMessage, scroll = true): HTMLElement {
    const doc = this.container.ownerDocument;
    const win = doc.defaultView;
    const el = doc.createElement("div");
    el.className = `paperpilot-msg ${msg.role === "user" ? "user" : "ai"}`;
    el.id = `msg-${msg.id}`;

    let html = "";
    if (msg.role === "user") {
      if (msg.selectedQuote) {
        html += `<div style="font-size:11px; opacity:0.8; border-left: 2px solid currentColor; padding-left:6px; margin-bottom:4px;">“${this.escape(
          msg.selectedQuote
        )}”</div>`;
      }
      html += `<div>${this.escape(msg.content)}</div>`;
    } else {
      if (msg.domain) {
        html += `<div><span class="paperpilot-domain-badge">${this.escape(msg.domain)}</span></div>`;
      }
      html += `<div class="msg-content">${this.renderMarkdown(msg.content)}</div>`;
      html += `<div style="display:flex; justify-content:flex-end; margin-top:4px;">
        <button class="paperpilot-btn btn-copy-msg" style="font-size:11px; padding:2px 6px;">📋 复制</button>
      </div>`;
    }

    el.innerHTML = html;

    const copyBtn = el.querySelector(".btn-copy-msg") as HTMLButtonElement;
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        const copyText = msg.content;
        const nav = win?.navigator || (typeof navigator !== "undefined" ? navigator : null);
        if (nav?.clipboard?.writeText) {
          nav.clipboard.writeText(copyText).catch(() => {});
        } else if (typeof Zotero !== "undefined" && (Zotero as any).Utilities?.copyTextToClipboard) {
          (Zotero as any).Utilities.copyTextToClipboard(copyText);
        } else {
          try {
            const ta = doc.createElement("textarea");
            ta.value = copyText;
            doc.body.appendChild(ta);
            ta.select();
            doc.execCommand("copy");
            doc.body.removeChild(ta);
          } catch (e) {}
        }
        copyBtn.textContent = "已复制!";
        setTimeout(() => (copyBtn.textContent = "📋 复制"), 1500);
      });
    }

    this.container.appendChild(el);
    if (scroll) {
      this.scrollToBottom();
    }
    return el;
  }

  /**
   * Appends incremental text chunk during streaming without full DOM or Markdown re-rendering.
   * O(1) text node operation for high-frequency token updates.
   */
  appendStreamingDelta(msgId: string, delta: string): void {
    const doc = this.container.ownerDocument;
    const el = this.container.querySelector(`#msg-${msgId}`);
    if (!el) return;

    const contentEl = el.querySelector(".msg-content") as HTMLElement;
    if (!contentEl) return;

    let textNode = this.streamingTextNodes.get(msgId);
    if (!textNode) {
      // First delta: clear placeholder content and create streaming text node
      contentEl.innerHTML = "";
      textNode = doc.createTextNode(delta);
      contentEl.appendChild(textNode);
      this.streamingTextNodes.set(msgId, textNode);
    } else {
      textNode.appendData(delta);
    }

    this.throttledScrollToBottom();
  }

  /**
   * Finalizes streaming message by executing full Markdown rendering once.
   */
  finishStreamingMessage(msgId: string, fullContent: string): void {
    this.streamingTextNodes.delete(msgId);
    const el = this.container.querySelector(`#msg-${msgId}`);
    if (el) {
      const contentEl = el.querySelector(".msg-content") as HTMLElement;
      if (contentEl) {
        contentEl.innerHTML = this.renderMarkdown(fullContent);
      }
    }
    this.scrollToBottom();
  }

  /**
   * Fallback / batch updater for non-token-level status changes.
   */
  updateStreamingMessage(msgId: string, content: string): void {
    this.streamingTextNodes.delete(msgId);
    const el = this.container.querySelector(`#msg-${msgId}`);
    if (el) {
      const contentEl = el.querySelector(".msg-content") as HTMLElement;
      if (contentEl) {
        contentEl.innerHTML = this.renderMarkdown(content);
        this.throttledScrollToBottom();
      }
    }
  }

  throttledScrollToBottom(): void {
    if (this.scrollTimer) return;
    const doc = this.container.ownerDocument;
    const win = doc.defaultView;
    if (win && typeof win.requestAnimationFrame === "function") {
      this.scrollTimer = win.requestAnimationFrame(() => {
        this.container.scrollTop = this.container.scrollHeight;
        this.scrollTimer = null;
      });
    } else {
      this.scrollTimer = setTimeout(() => {
        this.container.scrollTop = this.container.scrollHeight;
        this.scrollTimer = null;
      }, 80);
    }
  }

  scrollToBottom(): void {
    if (this.scrollTimer) {
      const doc = this.container.ownerDocument;
      const win = doc.defaultView;
      if (win && typeof win.cancelAnimationFrame === "function") {
        win.cancelAnimationFrame(this.scrollTimer);
      } else {
        clearTimeout(this.scrollTimer);
      }
      this.scrollTimer = null;
    }
    this.container.scrollTop = this.container.scrollHeight;
  }

  private renderMarkdown(md: string): string {
    if (!md) return "";
    return md
      .replace(/### (.*?)\n/g, "<h4 style='margin:6px 0 3px 0; font-size:13px; color:var(--pp-primary);'>$1</h4>")
      .replace(/## (.*?)\n/g, "<h3 style='margin:8px 0 4px 0; font-size:14px;'>$1</h3>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code style='background:rgba(0,0,0,0.06); padding:1px 4px; border-radius:3px;'>$1</code>")
      .replace(/\n\n/g, "<p style='margin:4px 0;'></p>")
      .replace(/\n/g, "<br/>");
  }

  private escape(str: string): string {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}
