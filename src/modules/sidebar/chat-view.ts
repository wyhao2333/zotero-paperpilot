import { ChatMessage } from "../../types/zotero";

const HTML_NS = "http://www.w3.org/1999/xhtml";

function parseMarkupToFragment(doc: Document, markup: string): DocumentFragment {
  const win = doc.defaultView;
  const MozXULElement =
    win?.MozXULElement ||
    (typeof MozXULElement !== "undefined"
      ? MozXULElement
      : typeof Zotero !== "undefined" && (Zotero as any).getMainWindow?.()?.MozXULElement);

  if (MozXULElement && typeof MozXULElement.parseXULToFragment === "function") {
    let frag = MozXULElement.parseXULToFragment(markup);
    if (frag.ownerDocument !== doc && typeof doc.importNode === "function") {
      frag = doc.importNode(frag, true) as DocumentFragment;
    }
    return frag;
  }

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
  let fragment = doc.createDocumentFragment();
  const rootNode = parsedDoc.documentElement?.firstChild || parsedDoc.documentElement;
  if (rootNode) {
    fragment.appendChild(rootNode);
  }
  if (fragment.ownerDocument !== doc && typeof doc.importNode === "function") {
    fragment = doc.importNode(fragment, true) as DocumentFragment;
  }
  return fragment;
}

export class ChatView {
  private container: HTMLElement;
  private streamingTextNodes: Map<string, Text> = new Map();
  private scrollTimer: any = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(messages: ChatMessage[]): void {
    if (typeof this.container.replaceChildren === "function") {
      this.container.replaceChildren();
    } else {
      while (this.container.firstChild) {
        this.container.removeChild(this.container.firstChild);
      }
    }
    this.streamingTextNodes.clear();
    for (const msg of messages) {
      this.appendMessage(msg, false);
    }
    this.scrollToBottom();
  }

  appendMessage(msg: ChatMessage, scroll = true): HTMLElement {
    const doc = this.container.ownerDocument;
    const win = doc.defaultView;

    let userQuoteMarkup = "";
    if (msg.role === "user" && msg.selectedQuote) {
      userQuoteMarkup = `<html:div style="font-size:11px; opacity:0.8; border-left: 2px solid currentColor; padding-left:6px; margin-bottom:4px;">“${this.escape(
        msg.selectedQuote
      )}”</html:div>`;
    }
    let userContentMarkup = "";
    if (msg.role === "user") {
      userContentMarkup = `<html:div>${this.escape(msg.content)}</html:div>`;
    }

    let aiDomainMarkup = "";
    let aiContentMarkup = "";
    let aiActionsMarkup = "";
    if (msg.role !== "user") {
      if (msg.domain) {
        aiDomainMarkup = `<html:div><html:span class="paperpilot-domain-badge">${this.escape(msg.domain)}</html:span></html:div>`;
      }
      aiContentMarkup = `<html:div class="msg-content">${this.renderMarkdown(msg.content)}</html:div>`;
      aiActionsMarkup = `<html:div style="display:flex; justify-content:flex-end; margin-top:4px;">
        <html:button class="paperpilot-btn btn-copy-msg" style="font-size:11px; padding:2px 6px;">📋 复制</html:button>
      </html:div>`;
    }

    const messageMarkup = `
<html:div
  xmlns:html="${HTML_NS}"
  class="paperpilot-msg ${msg.role === "user" ? "user" : "ai"}"
  id="msg-${msg.id}">
  ${msg.role === "user" ? userQuoteMarkup + userContentMarkup : aiDomainMarkup + aiContentMarkup + aiActionsMarkup}
</html:div>
`;

    const fragment = parseMarkupToFragment(doc, messageMarkup);
    const el = (fragment.firstElementChild || fragment.firstChild) as HTMLElement;

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
            const ta = doc.createElementNS(HTML_NS, "textarea") as HTMLTextAreaElement;
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

    this.container.appendChild(fragment);
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
      if (typeof contentEl.replaceChildren === "function") {
        contentEl.replaceChildren();
      } else {
        while (contentEl.firstChild) {
          contentEl.removeChild(contentEl.firstChild);
        }
      }
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
        this.renderMarkdownInto(contentEl, fullContent);
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
        this.renderMarkdownInto(contentEl, content);
        this.throttledScrollToBottom();
      }
    }
  }

  private renderMarkdownInto(targetEl: HTMLElement, md: string): void {
    const doc = targetEl.ownerDocument;
    const markup = `<html:div xmlns:html="${HTML_NS}">${this.renderMarkdown(md)}</html:div>`;
    const frag = parseMarkupToFragment(doc, markup);
    const wrapper = frag.firstElementChild || frag.firstChild;
    if (wrapper && wrapper.childNodes.length > 0) {
      if (typeof targetEl.replaceChildren === "function") {
        targetEl.replaceChildren(...Array.from(wrapper.childNodes));
      } else {
        while (targetEl.firstChild) {
          targetEl.removeChild(targetEl.firstChild);
        }
        while (wrapper.firstChild) {
          targetEl.appendChild(wrapper.firstChild);
        }
      }
    } else {
      if (typeof targetEl.replaceChildren === "function") {
        targetEl.replaceChildren();
      } else {
        while (targetEl.firstChild) {
          targetEl.removeChild(targetEl.firstChild);
        }
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
    let safe = this.escape(md);
    return safe
      .replace(/### (.*?)(?:\n|$)/g, "<html:h4 style='margin:6px 0 3px 0; font-size:13px; color:var(--pp-primary);'>$1</html:h4>")
      .replace(/## (.*?)(?:\n|$)/g, "<html:h3 style='margin:8px 0 4px 0; font-size:14px;'>$1</html:h3>")
      .replace(/\*\*(.*?)\*\*/g, "<html:strong>$1</html:strong>")
      .replace(/\*(.*?)\*/g, "<html:em>$1</html:em>")
      .replace(/`([^`]+)`/g, "<html:code style='background:rgba(0,0,0,0.06); padding:1px 4px; border-radius:3px;'>$1</html:code>")
      .replace(/\n\n/g, "<html:p style='margin:4px 0;'></html:p>")
      .replace(/\n/g, "<html:br/>");
  }

  private escape(str: string): string {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}
