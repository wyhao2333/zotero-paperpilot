const assert = require("assert");
const esbuild = require("esbuild");

console.log("=== [Test] Production Markdown & LaTeX Math Renderer ===");

// 1. Compile actual production markdown-math.ts via esbuild in memory
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

assert(MarkdownMathRenderer, "MarkdownMathRenderer must be exported");

// Test 1: looksLikeMath heuristic precision
console.log("-> Test 1: looksLikeMath heuristic precision");
const mathExpressions = [
  "x(k)=A(k)x(k-1)+B(k)u(k)",
  "P_{k|k-1} = F_k P_{k-1} F_k^T + Q_k",
  "A^T B = C",
  "E = mc^2",
  "y = \\alpha x + \\beta",
  "\\sum_{i=1}^n x_i^2",
  "\\frac{\\partial L}{\\partial w}",
  "f(x) \\sim \\mathcal{N}(0, 1)",
  "\\int_0^\\infty e^{-x} dx = 1",
  "x \\in \\mathbb{R}^n",
];

for (const expr of mathExpressions) {
  assert(
    MarkdownMathRenderer.looksLikeMath(expr),
    `looksLikeMath should be true for math: "${expr}"`
  );
}

const nonMathCode = [
  "const x = foo();",
  "function compute(a, b) { return a + b; }",
  "x = model.predict(data)",
  '{"key": "value", "id": 123}',
  "npm run build",
  "import { useState } from 'react';",
  "if (x > 0) { console.log(x); }",
];

for (const code of nonMathCode) {
  assert(
    !MarkdownMathRenderer.looksLikeMath(code),
    `looksLikeMath should be false for non-math code: "${code}"`
  );
}
console.log("  PASS: looksLikeMath distinguishes math from code reliably.");

// Test 2: normalizeModelMarkdown
console.log("-> Test 2: normalizeModelMarkdown fence stripping and repair");
const outerWrapped = "```markdown\n# Header\nText with $x=1$\n```";
assert.strictEqual(
  MarkdownMathRenderer.normalizeModelMarkdown(outerWrapped),
  "# Header\nText with $x=1$"
);

const brokenDelims = "Here is \\ ( x+1 \\ ) and \\ [ y=2 \\ ]";
const normalizedDelims = MarkdownMathRenderer.normalizeModelMarkdown(brokenDelims);
assert(normalizedDelims.includes("\\( x+1 \\)"), "Space after \\ must be normalized in inline");
assert(normalizedDelims.includes("\\[ y=2 \\]"), "Space after \\ must be normalized in block");

const mathFence = "```math\n\\nabla \\cdot B = 0\n```";
const convertedMath = MarkdownMathRenderer.normalizeModelMarkdown(mathFence);
assert(convertedMath.includes("$$\n\\nabla \\cdot B = 0\n$$"), "Math fence must convert to $$ block");

const untypedMath = "```\n\\dot{x} = Ax + Bu\n```";
const convertedUntyped = MarkdownMathRenderer.normalizeModelMarkdown(untypedMath);
assert(convertedUntyped.includes("$$\n\\dot{x} = Ax + Bu\n$$"), "Untyped math fence must convert to $$ block");

const untypedCode = "```\nconst a = 10;\nconst b = 20;\n```";
const preservedUntyped = MarkdownMathRenderer.normalizeModelMarkdown(untypedCode);
assert(preservedUntyped.includes("const a = 10;"), "Code block must be preserved");
assert(!preservedUntyped.includes("$$"), "Code block must not be converted to $$");
console.log("  PASS: normalizeModelMarkdown strips fences and repairs delimiters.");

// Test 3: tokenizeMath token stability (no markdown mangling)
console.log("-> Test 3: tokenizeMath token structure");
const tokenTest = "Let $a$ and $$b$$ be numbers.";
const { tokenizedText, tokens } = MarkdownMathRenderer.tokenizeMath(tokenTest);
assert.strictEqual(tokens.length, 2);
for (const t of tokens) {
  assert(!t.id.startsWith("__"), `Token ID "${t.id}" must NOT start with __ to avoid Markdown-it <strong> parsing`);
  assert(!t.id.endsWith("__"), `Token ID "${t.id}" must NOT end with __`);
  assert(/^[A-Z0-9]+$/.test(t.id), `Token ID "${t.id}" must be pure alphanumeric`);
}
console.log("  PASS: Math token IDs are pure alphanumeric and resistant to markdown mangling.");

// Test 4: renderForSidebarMarkup KaTeX MathML generation
console.log("-> Test 4: renderForSidebarMarkup KaTeX MathML generation");
const testMd = `
# Title
Inline math: $E=mc^2$ and $x_k = A x_{k-1} + B u_k$.
Display math:
$$
\\int_{-\\infty}^\\infty e^{-x^2} dx = \\sqrt{\\pi}
$$
Bracket math:
\\[
P_{k|k-1} = F_k P_{k-1} F_k^T + Q_k
\\]
Parentheses math: \\(\\alpha + \\beta = \\gamma\\).
`;

const sidebarHtml = MarkdownMathRenderer.renderForSidebarMarkup(testMd);

// Delimiters must not appear as raw text
assert(!sidebarHtml.includes("$E=mc^2$"), "Raw '$E=mc^2$' must be stripped");
assert(!sidebarHtml.includes("$$"), "Raw '$$' must be stripped");
assert(!sidebarHtml.includes("\\["), "Raw '\\[' must be stripped");
assert(!sidebarHtml.includes("\\]"), "Raw '\\]' must be stripped");
assert(!sidebarHtml.includes("\\("), "Raw '\\(' must be stripped");
assert(!sidebarHtml.includes("\\)"), "Raw '\\)' must be stripped");

// Must contain MathML elements and containers
assert(sidebarHtml.includes("<math xmlns="), "Must contain MathML root");
assert(sidebarHtml.includes("paperpilot-math-inline"), "Must contain inline math container");
assert(sidebarHtml.includes("paperpilot-math-block"), "Must contain block math container");
assert(sidebarHtml.includes("<semantics>"), "KaTeX output must include semantics");
assert(sidebarHtml.includes("<annotation encoding=\"application/x-tex\">"), "Must retain TeX annotation");

console.log("  PASS: Sidebar markup produces clean MathML and strips raw delimiters.");

// Test 5: renderForZoteroNoteBody and renderForZoteroNote
console.log("-> Test 5: Zotero Note rendering & schema isolation");
const noteInput = "Here is formula $E=mc^2$ and block:\n$$\\sum_{i=1}^n x_i = S$$";
const noteBody = MarkdownMathRenderer.renderForZoteroNoteBody(noteInput);
assert(!noteBody.includes('data-schema-version="9"'), "renderForZoteroNoteBody must NOT contain schema wrapper");
assert(noteBody.includes('<span class="math">$E=mc^2$</span>'), "Inline math must be <span class=\"math\">$E=mc^2$</span>");
assert(noteBody.includes('<pre class="math">$$\\sum_{i=1}^n x_i = S$$</pre>'), "Block math must be <pre class=\"math\">$$...$$</pre>");

const fullNote = MarkdownMathRenderer.renderForZoteroNote(noteInput);
const schemaMatches = fullNote.match(/data-schema-version="9"/g);
assert.strictEqual(schemaMatches.length, 1, "renderForZoteroNote must have exactly ONE data-schema-version wrapper");
assert(fullNote.startsWith('<div data-schema-version="9">'), "Full note must start with schema wrapper");
assert(fullNote.endsWith('</div>'), "Full note must end with closing div");

console.log("  PASS: Zotero Note rendering produces valid native math and isolated schema.");

// Test 6: Bare inline math & list items (Real user screenshot case)
console.log("-> Test 6: Conservative bare-math list items and equations");
const bareListMd = `
其中：

- x_k ∈ R^n: 状态向量
- d_k ∈ R^m: 未知输入向量
- y_k ∈ R^p: 测量向量
- w_k ∈ R^n: 过程噪声，协方差矩阵Q_k = E[w_k w_k^T]
- v_k ∈ R^p: 测量噪声，协方差矩阵R_k = E[v_k v_k^T]
`;

const bareListHtml = MarkdownMathRenderer.renderForSidebarMarkup(bareListMd);

// MathML should be generated for x_k ∈ R^n, Q_k = E[w_k w_k^T], etc.
assert(bareListHtml.includes("<math xmlns="), "Bare math list items must produce MathML");
assert(bareListHtml.includes("paperpilot-math-inline"), "Bare math must produce inline math containers");
assert(bareListHtml.includes("状态向量"), "Chinese text must be preserved");
assert(bareListHtml.includes("过程噪声，协方差矩阵"), "Chinese explanation must be preserved");
assert(!bareListHtml.includes("x_k ∈ R^n:"), "Bare 'x_k ∈ R^n:' should not remain unparsed");
console.log("  PASS: Bare math list items and embedded equations rendered as MathML.");

// Test 7: Bare block math lines
console.log("-> Test 7: Bare block math equations");
const bareBlockMd = `
系统模型：

x_{k+1} = A_k x_k + G_k d_k + w_k

y_k = C_k x_k + v_k
`;

const bareBlockHtml = MarkdownMathRenderer.renderForSidebarMarkup(bareBlockMd);
assert(bareBlockHtml.includes("paperpilot-math-block"), "Standalone bare math equations must produce block math containers");
assert(bareBlockHtml.includes("<math xmlns="), "Standalone bare math equations must produce MathML");
assert(bareBlockHtml.includes("系统模型："), "Header must be preserved");
console.log("  PASS: Standalone bare math lines converted to block MathML.");

// Test 8: Ordinary text rejection (Zero false-positives)
console.log("-> Test 8: Non-math text rejection (Zero false-positives)");
const ordinaryMd = `
Ordinary identifiers:
paperpilot_runtime_v4
file_name_v2
glm-4.5
api_key
session_1
model.predict(x)
npm run build
C:\\Users\\foo_bar
state_space_model
`;

const ordinaryNormalized = MarkdownMathRenderer.normalizeModelMarkdown(ordinaryMd);
assert(!ordinaryNormalized.includes("$"), "Ordinary identifiers must not receive dollar signs");
assert(ordinaryNormalized.includes("paperpilot_runtime_v4"));
assert(ordinaryNormalized.includes("file_name_v2"));
assert(ordinaryNormalized.includes("glm-4.5"));
assert(ordinaryNormalized.includes("api_key"));
assert(ordinaryNormalized.includes("session_1"));
assert(ordinaryNormalized.includes("model.predict(x)"));
assert(ordinaryNormalized.includes("npm run build"));
assert(ordinaryNormalized.includes("C:\\Users\\foo_bar"));
assert(ordinaryNormalized.includes("state_space_model"));
console.log("  PASS: Ordinary technical text preserved without false-positive math conversion.");

// Test 9: Zotero Note export with bare math
console.log("-> Test 9: Zotero Note export with bare math");
const noteBareInput = `- x_k ∈ R^n: 状态向量\n\nx_{k+1} = A_k x_k + w_k`;
const noteBareOutput = MarkdownMathRenderer.renderForZoteroNoteBody(noteBareInput);
assert(noteBareOutput.includes('<span class="math">'), "Inline bare math in note must become <span class=\"math\">");
assert(noteBareOutput.includes('<pre class="math">'), "Block bare math in note must become <pre class=\"math\">");
assert(noteBareOutput.includes("状态向量"), "Note body preserves Chinese prose");
console.log("  PASS: Zotero Note export converts bare math to native note math elements.");

console.log("=== All Production Markdown & LaTeX Math tests passed successfully ===");
