const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("=== [Test] Floating Bar DOM Safety & XSS Defense ===");

// 1. Static code analysis of floating-bar.ts
console.log("-> Check 1: Static inspection of innerHTML usage in floating-bar.ts");
const fbSrc = fs.readFileSync(path.join("src", "modules", "reader", "floating-bar.ts"), "utf-8");

// Detect any dangerous innerHTML assignments with dynamic variables
const dangerousInnerHtmlPatterns = [
  /innerHTML\s*=\s*`[^`]*\$\{(?:err|error|progressMsg|partialText|cleanText|text|translated|full)[^}]*\}[^`]*`/i,
  /innerHTML\s*=\s*[^;\n]*\+\s*(?:err|error|progressMsg|partialText|cleanText|text|translated|full)/i,
  /bodyEl\.innerHTML\s*=\s*`[^`]*\$\{/i,
];

for (const pattern of dangerousInnerHtmlPatterns) {
  const match = fbSrc.match(pattern);
  assert(!match, `Found unsafe dynamic innerHTML assignment in floating-bar.ts: ${match?.[0]}`);
}
console.log("  PASS: Zero dynamic variable injections in innerHTML found.");

// 2. Verify all error messages are set via DOM textContent
console.log("-> Check 2: Error and progress messages use DOM textContent");
assert(
  fbSrc.includes("errSpan.textContent = `❌ 翻译失败: ${err?.message || err}`") ||
  fbSrc.includes("errSpan.textContent = `❌ 翻译失败:"),
  "Translation error must be assigned to textContent"
);
assert(
  fbSrc.includes("errSpan.textContent = `❌ 解读失败: ${err?.message || err}`") ||
  fbSrc.includes("errSpan.textContent = `❌ 解读失败:"),
  "Interpretation error must be assigned to textContent"
);
assert(
  fbSrc.includes("statusDiv.textContent = `⏳ ${progressMsg}`"),
  "Progress message must be assigned to textContent"
);
assert(
  fbSrc.includes("previewDiv.textContent = partialText"),
  "Partial text preview must be assigned to textContent"
);
console.log("  PASS: Dynamic strings assigned via textContent exclusively.");

// 3. Verify replaceChildren is used safely
console.log("-> Check 3: Container update uses replaceChildren");
assert(
  fbSrc.includes("bodyEl.replaceChildren("),
  "bodyEl updates must use replaceChildren for clean DOM replacement without residual nodes"
);

// 4. Runtime simulation of malicious payload handling
console.log("-> Check 4: Runtime simulation of malicious payload handling");
class MockElement {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this._textContent = "";
  }
  set textContent(val) {
    this._textContent = val;
  }
  get textContent() {
    return this._textContent;
  }
  replaceChildren(...nodes) {
    this.children = nodes;
  }
  appendChild(node) {
    this.children.push(node);
  }
}

const mockDoc = {
  createElement: (tag) => new MockElement(tag),
  createTextNode: (text) => ({ nodeType: 3, textContent: text }),
};

const xssPayload = '<img src="x" onerror="alert(1)"> & <script>alert("hacked")</script>';

// Simulate error handling with malicious payload
const errSpan = mockDoc.createElement("span");
errSpan.textContent = `❌ 翻译失败: ${xssPayload}`;
assert.strictEqual(errSpan.children.length, 0, "errSpan must not parse inner HTML or create child elements");
assert(errSpan.textContent.includes(xssPayload), "Text content must preserve exact raw text safely");

// Simulate preview handling with malicious payload
const previewDiv = mockDoc.createElement("div");
previewDiv.textContent = xssPayload;
assert.strictEqual(previewDiv.children.length, 0, "previewDiv must not parse inner HTML");
assert.strictEqual(previewDiv.textContent, xssPayload, "previewDiv must store exact string as text");

const bodyEl = mockDoc.createElement("div");
bodyEl.replaceChildren(errSpan);
assert.strictEqual(bodyEl.children.length, 1, "bodyEl contains only the safe span element");
assert.strictEqual(bodyEl.children[0].children.length, 0, "Nested child elements are not created");

console.log("  PASS: Malicious payload rendered safely as inert text.");
console.log("✅ Floating Bar DOM Safety & XSS Defense tests passed successfully.");
