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

console.log("=== All Production Markdown & LaTeX Math tests passed successfully ===");
