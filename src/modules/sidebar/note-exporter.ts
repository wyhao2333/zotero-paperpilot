import { ChatMessage } from "../../types/zotero";

export class NoteExporter {
  static async exportToZoteroNote(parentItemID: number, title: string, messages: ChatMessage[]): Promise<boolean> {
    if (typeof Zotero === "undefined" || !Zotero.Item) {
      dump("[PaperPilot] Zotero.Item is not available in current context\n");
      return false;
    }

    try {
      const noteItem = new Zotero.Item("note");
      noteItem.parentItemID = parentItemID;

      let html = `<h2>📖 PaperPilot 伴读笔记: ${this.escape(title || "文献笔记")}</h2>`;
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
          html += `<div>${this.formatMarkdownToHtml(msg.content)}</div><hr/>`;
        }
      }

      noteItem.setNote(html);
      await noteItem.saveTx();
      return true;
    } catch (e) {
      dump(`[PaperPilot] Failed to export note: ${e}\n`);
      return false;
    }
  }

  private static formatMarkdownToHtml(md: string): string {
    return md
      .replace(/### (.*?)\n/g, "<h4>$1</h4>")
      .replace(/## (.*?)\n/g, "<h3>$1</h3>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/\n\n/g, "<br/><br/>")
      .replace(/\n/g, "<br/>");
  }

  private static escape(str: string): string {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}
