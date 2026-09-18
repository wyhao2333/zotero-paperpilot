import { ChatMessage } from "../../types/zotero";

export class ChatView {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(messages: ChatMessage[]): void {
    this.container.innerHTML = "";
    for (const msg of messages) {
      this.appendMessage(msg, false);
    }
    this.scrollToBottom();
  }

  appendMessage(msg: ChatMessage, scroll = true): HTMLElement {
    const el = document.createElement("div");
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

    const copyBtn = el.querySelector(".btn-copy-msg");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(msg.content);
          copyBtn.textContent = "已复制!";
          setTimeout(() => (copyBtn.textContent = "📋 复制"), 1500);
        }
      });
    }

    this.container.appendChild(el);
    if (scroll) {
      this.scrollToBottom();
    }
    return el;
  }

  updateStreamingMessage(msgId: string, content: string): void {
    const el = this.container.querySelector(`#msg-${msgId}`);
    if (el) {
      const contentEl = el.querySelector(".msg-content");
      if (contentEl) {
        contentEl.innerHTML = this.renderMarkdown(content);
        this.scrollToBottom();
      }
    }
  }

  scrollToBottom(): void {
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
