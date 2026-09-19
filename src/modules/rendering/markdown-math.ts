import MarkdownIt from "markdown-it";
import katex from "katex";

export const HTML_NS = "http://www.w3.org/1999/xhtml";
export const MATHML_NS = "http://www.w3.org/1998/Math/MathML";

// DOM nodeType standard numeric constants to avoid global Node dependency in Zotero sandbox
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

export interface MathToken {
  id: string;
  raw: string;
  block: boolean;
}

export class MarkdownMathRenderer {
  private static mdInstance: MarkdownIt | null = null;

  private static getMarkdownIt(): MarkdownIt {
    if (!this.mdInstance) {
      this.mdInstance = new MarkdownIt({
        html: false,
        linkify: true,
        breaks: true,
      });
    }
    return this.mdInstance;
  }

  /**
   * Generates pure alphanumeric tokens safe from MarkdownIt parsing,
   * HTML entity conversion, or prose collisions.
   */
  static makeMathToken(index: number, block: boolean): string {
    return block
      ? `PAPERPILOTMATHTOKENBLOCK${index}END`
      : `PAPERPILOTMATHTOKENINLINE${index}END`;
  }

  /**
   * Detects whether text inside an untyped code block represents a mathematical formula.
   */
  static looksLikeMath(text: string): boolean {
    if (!text || !text.trim()) return false;
    const trimmed = text.trim();

    // Check for programming language signatures that rule out math
    const codeSignatures = [
      /\bimport\s+[\w{}*]/,
      /\bfrom\s+['"][\w.-]+['"]/,
      /\bdef\s+\w+\s*\(/,
      /\bconst\s+\w+\s*=/,
      /\blet\s+\w+\s*=/,
      /\bvar\s+\w+\s*=/,
      /\bfunction\s*\w*\s*\(/,
      /\breturn\s+[;a-zA-Z0-9]/,
      /\bconsole\.(log|error|warn)\(/,
      /\bnpm\s+(run|test|build|install)/,
      /\b[a-zA-Z_]\w*\s*=\s*[a-zA-Z_]\w*\.[a-zA-Z_]\w*\(/,
      /\bclass\s+\w+\s*[{:]/,
      /\bpublic\s+\w+/,
      /\bprivate\s+\w+/,
      /\bif\s*\([^)]+\)\s*\{/,
      /\bfor\s*\([^)]+\)\s*\{/,
      /\bwhile\s*\([^)]+\)\s*\{/,
      /\/\/[^\n]*/,
      /\/\*[\s\S]*?\*\//,
      /<!DOCTYPE/i,
      /<html/i,
      /^\s*\{[\s\S]*"[a-zA-Z0-9_]+":/m,
    ];

    for (const pattern of codeSignatures) {
      if (pattern.test(trimmed)) {
        return false;
      }
    }

    // Strong LaTeX keywords and mathematical notations
    const latexCommands = [
      /\\(frac|sum|int|iint|iiint|oint|prod|sqrt|hat|bar|tilde|vec|dot|ddot|mathbf|mathcal|mathbb|mathrm|text|operatorname)/,
      /\\(alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega)/i,
      /\\(Phi|Theta|Lambda|Sigma|Omega|Delta|Gamma|Psi)/,
      /\\(partial|nabla|times|cdot|circ|pm|mp|in|notin|subset|subseteq|cup|cap|lor|land|forall|exists)/,
      /\\(le|ge|leq|geq|neq|equiv|approx|sim|propto|ll|gg|infty|rightarrow|leftarrow|iff|implies)/,
      /\\(sin|cos|tan|log|ln|exp|det|dim|ker|max|min|sup|inf|lim|to)/,
      /\\begin\{(matrix|pmatrix|bmatrix|vmatrix|Vmatrix|aligned|align|gather|cases|split)\}/,
      /\\(left|right)[(\[{|.]/,
      /\\[,;:! ]/,
      /\b[a-zA-Z]\s*\([a-zA-Z0-9+\-*|,\s]+\)\s*=\s*[a-zA-Z0-9+\-*|(\s]/,
      /[a-zA-Z]_\{?[a-zA-Z0-9+\-*|,\s]+\}?/,
      /[a-zA-Z]\^\{?[a-zA-Z0-9+\-*|,\s]+\}?/,
      /\bE\s*=\s*mc\^2\b/i,
    ];

    for (const cmd of latexCommands) {
      if (cmd.test(trimmed)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Normalizes model-generated Markdown to strip outer accidental fences,
   * convert math/latex fences to block math, and repair broken delimiters.
   */
  static normalizeModelMarkdown(markdown: string): string {
    if (!markdown) return "";
    let text = markdown.trim();

    // A. Strip outer wrapper if the entire response is wrapped in a markdown fence
    const outerFenceRegex = /^```(?:markdown|md)\r?\n([\s\S]*?)\r?\n```$/i;
    const outerMatch = text.match(outerFenceRegex);
    if (outerMatch) {
      text = outerMatch[1].trim();
    } else {
      const untypedOuter = text.match(/^```\r?\n([\s\S]*?)\r?\n```$/);
      if (untypedOuter && !this.looksLikeMath(untypedOuter[1])) {
        if (/#{1,6}\s+|(?:\r?\n){2,}/.test(untypedOuter[1])) {
          text = untypedOuter[1].trim();
        }
      }
    }

    // B. Fix broken delimiters with accidental space: \ ( -> \(, \ ) -> \), \ [ -> \[, \ ] -> \]
    text = text
      .replace(/\\\s+\(/g, "\\(")
      .replace(/\\\s+\)/g, "\\)")
      .replace(/\\\s+\[/g, "\\[")
      .replace(/\\\s+\]/g, "\\]");

    // C. Convert math/latex/tex fenced blocks to block math $$ ... $$
    text = text.replace(/```(?:math|latex|tex)\r?\n([\s\S]*?)\r?\n```/gi, (_, body) => {
      return `\n\n$$\n${body.trim()}\n$$\n\n`;
    });

    // D. Check untyped code fences (```\n...\n```)
    text = text.replace(/```\r?\n([\s\S]*?)\r?\n```/g, (fullMatch, body) => {
      if (this.looksLikeMath(body)) {
        return `\n\n$$\n${body.trim()}\n$$\n\n`;
      }
      return fullMatch;
    });

    return text;
  }

  /**
   * Tokenizes all math blocks and inline formulas into pure alphanumeric placeholders.
   */
  static tokenizeMath(text: string): { tokenizedText: string; tokens: MathToken[] } {
    const tokens: MathToken[] = [];
    let tokenIndex = 0;

    // 1. Block math: $$ ... $$
    let tokenized = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, tex) => {
      const id = this.makeMathToken(tokenIndex++, true);
      tokens.push({ id, raw: tex, block: true });
      return id;
    });

    // 2. Block math: \[ ... \]
    tokenized = tokenized.replace(/\\\[([\s\S]*?)\\\]/g, (_, tex) => {
      const id = this.makeMathToken(tokenIndex++, true);
      tokens.push({ id, raw: tex, block: true });
      return id;
    });

    // 3. Inline math: \( ... \)
    tokenized = tokenized.replace(/\\\(([\s\S]*?)\\\)/g, (_, tex) => {
      const id = this.makeMathToken(tokenIndex++, false);
      tokens.push({ id, raw: tex, block: false });
      return id;
    });

    // 4. Inline math: $ ... $ (excluding escaped \$)
    tokenized = tokenized.replace(/(?<!\\)\$((?:[^\$\n\\]|\\.)+)\$/g, (_, tex) => {
      const id = this.makeMathToken(tokenIndex++, false);
      tokens.push({ id, raw: tex, block: false });
      return id;
    });

    return { tokenizedText: tokenized, tokens };
  }

  /**
   * Renders Markdown + KaTeX MathML markup for the Sidebar UI.
   * Returns XHTML-compatible markup string.
   */
  static renderForSidebarMarkup(markdown: string): string {
    if (!markdown) return "";
    const normalized = this.normalizeModelMarkdown(markdown);
    const { tokenizedText, tokens } = this.tokenizeMath(normalized);

    const md = this.getMarkdownIt();
    let html = md.render(tokenizedText);

    // Replace math tokens with KaTeX MathML
    for (const token of tokens) {
      let rendered = "";
      try {
        rendered = katex.renderToString(token.raw.trim(), {
          displayMode: token.block,
          output: "mathml",
          throwOnError: false,
        });
      } catch (err) {
        rendered = `<span class="katex-fallback">${this.escapeHtml(token.raw.trim())}</span>`;
      }

      const mathHtml = token.block
        ? `<div class="paperpilot-math-block" style="display:block; margin:6px 0; text-align:center; overflow-x:auto;">${rendered}</div>`
        : `<span class="paperpilot-math-inline" style="display:inline-block; vertical-align:middle;">${rendered}</span>`;

      html = html.replace(token.id, () => mathHtml);
    }

    return html;
  }

  /**
   * Converts HTML string to a safe DocumentFragment under the target document's XHTML namespace.
   * Uses ownerDocument context and avoids any dependency on global Node or global DOMParser.
   */
  static renderForSidebar(markdown: string, ownerDocument: Document): DocumentFragment {
    const rawHtml = this.renderForSidebarMarkup(markdown);
    const fragment = ownerDocument.createDocumentFragment();

    const win = ownerDocument.defaultView;
    const DOMParserCtor =
      win?.DOMParser ||
      (typeof DOMParser !== "undefined" ? DOMParser : null) ||
      (globalThis as any).DOMParser;

    if (!DOMParserCtor) {
      throw new Error("DOMParser unavailable in target Zotero document window");
    }

    const parser = new DOMParserCtor();
    const doc = parser.parseFromString(
      `<!DOCTYPE html><html><body><div id="wrapper">${rawHtml}</div></body></html>`,
      "text/html"
    );

    const wrapper = doc.getElementById("wrapper");
    if (!wrapper) return fragment;

    const convertNode = (node: any): Node | null => {
      if (node.nodeType === TEXT_NODE) {
        return ownerDocument.createTextNode(node.textContent || "");
      }
      if (node.nodeType === ELEMENT_NODE) {
        const el = node as Element;
        const isMathML =
          el.namespaceURI === MATHML_NS ||
          el.tagName.toLowerCase() === "math" ||
          el.closest("math") !== null;

        const ns = isMathML ? MATHML_NS : HTML_NS;
        const newEl = ownerDocument.createElementNS(ns, el.tagName.toLowerCase());

        for (let i = 0; i < el.attributes.length; i++) {
          const attr = el.attributes[i];
          newEl.setAttribute(attr.name, attr.value);
        }

        for (let i = 0; i < el.childNodes.length; i++) {
          const child = convertNode(el.childNodes[i]);
          if (child) newEl.appendChild(child);
        }

        return newEl;
      }
      return null;
    };

    while (wrapper.firstChild) {
      const converted = convertNode(wrapper.firstChild);
      if (converted) fragment.appendChild(converted);
      wrapper.removeChild(wrapper.firstChild);
    }

    return fragment;
  }

  /**
   * Renders Markdown + Zotero Native Math markup for Zotero Note Editor Body.
   * Does NOT wrap in <div data-schema-version="9"> (NoteExporter provides the single outer schema root).
   * Format:
   * - Inline: <span class="math">$...$</span>
   * - Block: <pre class="math">$$...$$</pre>
   * - Titles: <h1>, <h2>, etc.
   */
  static renderForZoteroNoteBody(markdown: string): string {
    if (!markdown) return "";
    const normalized = this.normalizeModelMarkdown(markdown);
    const { tokenizedText, tokens } = this.tokenizeMath(normalized);

    const md = this.getMarkdownIt();
    let html = md.render(tokenizedText);

    // Replace math tokens with Zotero Note native elements
    for (const token of tokens) {
      const cleanTex = this.escapeHtml(token.raw.trim());
      const mathHtml = token.block
        ? `<pre class="math">$$${cleanTex}$$</pre>`
        : `<span class="math">$${cleanTex}$</span>`;

      html = html.replace(token.id, () => mathHtml);
    }

    return html;
  }

  /**
   * Standalone helper wrapping renderForZoteroNoteBody in data-schema-version="9".
   */
  static renderForZoteroNote(markdown: string): string {
    return `<div data-schema-version="9">\n${this.renderForZoteroNoteBody(markdown)}\n</div>`;
  }

  static escapeHtml(str: string): string {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
