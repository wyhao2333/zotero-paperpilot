const assert = require("assert");
const esbuild = require("esbuild");

/**
 * Test: Markdown & LaTeX Math Formula Rendering against Production Code
 * Bundles src/modules/rendering/markdown-math.ts with esbuild in memory and verifies:
 * - $$...$$
 * - \[...\]
 * - \(...\)
 * - $...$
 * - Delimiters stripped, KaTeX MathML embedded, Zotero Note native math valid.
 */
function testMathRendering() {
  console.log("=== [Test 5] LaTeX Math & Markdown Rendering (Production Code) ===");

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
  const { MarkdownMathRenderer } = moduleObj.exports;

  // Test Case 1: Inline Math $E=mc^2$
  const input1 = "根据狭义相对论，质能等价公式为 $E=mc^2$ 成立。";
  const out1 = MarkdownMathRenderer.renderForSidebarMarkup(input1);
  assert(!out1.includes("$E=mc^2$"), "Raw '$E=mc^2$' delimiter must not appear in output");
  assert(out1.includes("paperpilot-math-inline"), "Inline math container must exist");
  assert(out1.includes("<math xmlns="), "MathML element must be rendered");
  console.log("✅ Inline math $...$ stripped and rendered as MathML.");

  // Test Case 2: Block Math $$ ... $$
  const input2 = "高斯积分形式如下：\n$$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$\n具有良好的对称性。";
  const out2 = MarkdownMathRenderer.renderForSidebarMarkup(input2);
  assert(!out2.includes("$$"), "Raw '$$' delimiter must not appear in output");
  assert(out2.includes("paperpilot-math-block"), "Block math container must exist");
  assert(out2.includes("<math xmlns="), "Block MathML element must be rendered");
  console.log("✅ Block math $$...$$ stripped and rendered as block MathML.");

  // Test Case 3: Parenthesis/bracket Delimiters \(...\) and \[...\]
  const input3 = "在线性系统中，若 \\(f(x) \\le M\\)，则矩阵方程满足：\n\\[ A x = b \\]";
  const out3 = MarkdownMathRenderer.renderForSidebarMarkup(input3);
  assert(!out3.includes("\\("), "Raw '\\(' must not appear in output");
  assert(!out3.includes("\\)"), "Raw '\\)' must not appear in output");
  assert(!out3.includes("\\["), "Raw '\\[' must not appear in output");
  assert(!out3.includes("\\]"), "Raw '\\]' must not appear in output");
  assert(out3.includes("paperpilot-math-inline"), "Inline \\(...\\) must produce inline math");
  assert(out3.includes("paperpilot-math-block"), "Block \\[...\\] must produce block math");
  console.log("✅ Delimiters \\(...\\) and \\[...\\] stripped and converted to MathML.");

  // Test Case 4: Escaped dollar \$ must not trigger math
  const input4 = "该项研究预算约为 \\$1000 美元。";
  const out4 = MarkdownMathRenderer.renderForSidebarMarkup(input4);
  assert(!out4.includes("paperpilot-math-inline"), "Escaped \\$ must not trigger inline math");
  console.log("✅ Escaped dollar \\$ properly excluded from math parsing.");

  // Test Case 5: Model Markdown Normalization (Fence stripping & math blocks)
  const fencedModelOutput = "```markdown\n# 核心公式\n```latex\n\\int_0^1 x^2 dx = \\frac{1}{3}\n```\n```";
  const normalized = MarkdownMathRenderer.normalizeModelMarkdown(fencedModelOutput);
  assert(!normalized.startsWith("```markdown"), "Outer markdown fence must be stripped");
  assert(normalized.includes("$$\n\\int_0^1 x^2 dx = \\frac{1}{3}\n$$"), "```latex fence must be converted to $$...$$ block");
  console.log("✅ Outer fence stripped and ```latex block converted to $$ math.");

  // Test Case 6: Math-like untyped code block normalization
  const mathCodeBlock = "```\nE = mc^2\n```";
  const normalizedUntyped = MarkdownMathRenderer.normalizeModelMarkdown(mathCodeBlock);
  assert(normalizedUntyped.includes("$$\nE = mc^2\n$$"), "Untyped math block must be converted to $$ math");
  console.log("✅ Untyped code block with math heuristic converted to $$ math.");

  // Test Case 7: Zotero Note Native Math (Schema 9)
  const noteInput = "推导结论：在假定条件下 $a^2 + b^2 = c^2$，且：\n$$\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}$$";
  const noteOutput = MarkdownMathRenderer.renderForZoteroNoteBody(noteInput);
  assert(noteOutput.includes('<span class="math">$a^2 + b^2 = c^2$</span>'), "Note must contain <span class='math'>$formula$</span>");
  assert(noteOutput.includes('<pre class="math">$$\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}$$</pre>'), "Note must contain <pre class='math'>$$formula$$</pre>");
  console.log("✅ Zotero Note native math formatting (<span class='math'> and <pre class='math'>) verified.");
}

try {
  testMathRendering();
  console.log("ALL MATH RENDERING TESTS PASSED.\n");
} catch (err) {
  console.error("❌ Test failed:", err);
  process.exit(1);
}
