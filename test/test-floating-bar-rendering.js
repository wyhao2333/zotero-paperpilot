const assert = require("assert");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

console.log("=== [Test] Floating Bar Math Rendering & Markdown Integration ===");

// 1. Static Source Inspection of floating-bar.ts
console.log("-> Check 1: floating-bar.ts imports and calls MarkdownMathRenderer");
const fbSrc = fs.readFileSync(path.join("src", "modules", "reader", "floating-bar.ts"), "utf-8");

assert(
  fbSrc.includes('import { MarkdownMathRenderer } from "../rendering/markdown-math";'),
  "floating-bar.ts must import MarkdownMathRenderer"
);

assert(
  fbSrc.includes("MarkdownMathRenderer.renderForSidebar(full, doc)"),
  "btnInterpret completion must call MarkdownMathRenderer.renderForSidebar(full, doc)"
);

assert(
  fbSrc.includes("bodyEl.replaceChildren(fragment)") || fbSrc.includes("bodyEl.replaceChildren("),
  "floating-bar.ts must use replaceChildren to swap rendered markdown into bodyEl"
);

assert(
  fbSrc.includes("bodyEl.textContent = full"),
  "floating-bar.ts must provide plaintext fallback bodyEl.textContent = full if rendering fails"
);

assert(
  fbSrc.includes("doc.createTextNode(delta)"),
  "Streaming chunks must use doc.createTextNode(delta) without parsing full Markdown repeatedly"
);

assert(
  fbSrc.includes("latestResultText"),
  "floating-bar.ts must track latestResultText to copy clean original text/markdown"
);
console.log("  PASS: floating-bar.ts static architecture verified.");

// 2. Functional DOM rendering test with mock ownerDocument
console.log("-> Check 2: Functional MarkdownMathRenderer.renderForSidebar test");
const buildResult = esbuild.buildSync({
  entryPoints: ["src/modules/rendering/markdown-math.ts"],
  bundle: true,
  format: "cjs",
  write: false,
  platform: "node",
});

const moduleObj = { exports: {} };
const runner = new Function("module", "exports", "require", buildResult.outputFiles[0].text);
runner(moduleObj, moduleObj.exports, require);
const { MarkdownMathRenderer, HTML_NS, MATHML_NS } = moduleObj.exports;

// Build minimal DOM environment
class MockDOMNode {
  constructor(nodeType, tagName = "", namespaceURI = HTML_NS) {
    this.nodeType = nodeType;
    this.tagName = tagName;
    this.namespaceURI = namespaceURI;
    this.attributes = {};
    this.childNodes = [];
    this.textContent = "";
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  appendChild(child) {
    this.childNodes.push(child);
    return child;
  }
  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) this.childNodes.splice(idx, 1);
    return child;
  }
  get firstChild() {
    return this.childNodes[0] || null;
  }
}

class MockDOMFragment extends MockDOMNode {
  constructor() {
    super(11); // DOCUMENT_FRAGMENT_NODE
  }
}

// Minimal DOMParser mock
class MockDOMParser {
  parseFromString(str, type) {
    // Basic parser extracting html tags for test
    const root = new MockDOMNode(1, "div");
    root.id = "wrapper";

    const textNode = new MockDOMNode(3);
    textNode.textContent = str;
    root.appendChild(textNode);

    const docMock = {
      getElementById: (id) => (id === "wrapper" ? root : null),
    };
    return docMock;
  }
}

const mockDoc = {
  createDocumentFragment: () => new MockDOMFragment(),
  createTextNode: (t) => {
    const n = new MockDOMNode(3);
    n.textContent = t;
    return n;
  },
  createElementNS: (ns, tag) => new MockDOMNode(1, tag, ns),
  defaultView: {
    DOMParser: MockDOMParser,
  },
};

const renderedFragment = MarkdownMathRenderer.renderForSidebar(
  "Here is formula $E=mc^2$ and text",
  mockDoc
);
assert(renderedFragment, "renderForSidebar must return a document fragment");
assert(renderedFragment.nodeType === 11, "Must return DOCUMENT_FRAGMENT_NODE");
console.log("  PASS: renderForSidebar returns valid DOM fragment.");

// 3. Verify markup contains math elements
const markup = MarkdownMathRenderer.renderForSidebarMarkup("学术公式：$x_{k+1} = A_k x_k + B_k u_k$");
assert(markup.includes("<math xmlns="), "renderForSidebarMarkup must generate MathML");
assert(markup.includes("paperpilot-math-inline"), "Inline math container must exist");
assert(!markup.includes("$x_{k+1}"), "Raw dollar delimiter must be consumed");
console.log("  PASS: MathML generated cleanly for floating bar content.");

console.log("✅ Floating Bar Math Rendering tests passed successfully.");
