import { ChatMessage } from "../../types/zotero";
import { MarkdownMathRenderer } from "../rendering/markdown-math";

export class NoteExporter {
  static async exportToZoteroNote(parentItemID: number, title: string, messages: ChatMessage[]): Promise<boolean> {
    if (typeof Zotero === "undefined" || !Zotero.Item) {
      dump("[PaperPilot] Zotero.Item is not available in current context\n");
      return false;
    }

    try {
      const noteItem = new Zotero.Item("note");
      noteItem.parentItemID = parentItemID;

      let html = `<div data-schema-version="9">\n`;
      html += `<h1>📖 PaperPilot 伴读笔记: ${this.escape(title || "文献笔记")}</h1>`;
      html += `<p><em>导出时间: ${new Date().toLocaleString()}</em></p><hr/>`;

      for (const msg of messages) {
        if (msg.role === "user") {
          html += `<p><strong>🧑‍💻 提问:</strong></p>`;
          if (msg.selectedQuote) {
            html += `<blockquote><em>引用选段: ${this.escape(msg.selectedQuote)}</em></blockquote>`;
          }
          html += `<p>${this.escape(msg.content)}</p>`;
        } else if (msg.role === "assistant") {
          const domainBadge = msg.domain ? ` [${this.escape(msg.domain)}]` : "";
          html += `<p><strong>🤖 AI 回答${domainBadge}:</strong></p>`;
          html += `<div>${MarkdownMathRenderer.renderForZoteroNote(msg.content)}</div><hr/>`;
        }
      }

      html += `\n</div>`;

      noteItem.setNote(html);
      await noteItem.saveTx();
      return true;
    } catch (e) {
      dump(`[PaperPilot] Failed to export note: ${e}\n`);
      return false;
    }
  }

  private static escape(str: string): string {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
