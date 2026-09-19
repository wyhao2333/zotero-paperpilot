const assert = require("assert");
const katex = require("katex");

/**
 * Test: Markdown & LaTeX Math Formula Rendering
 * Tests delimiter extraction and KaTeX MathML conversion for:
 * - $$...$$
 * - \[...\]
 * - \(...\)
 * - $...$
 * Verifies that delimiters are completely stripped and MathML is embedded.
 */
function testMathRendering() {
  console.log("=== [Test 5] LaTeX Math & Markdown Rendering ===");

  function escapeXml(str) {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function renderMarkdownContent(md) {
    if (!md) return "";

    const mathTokens = [];
    let tokenIndex = 0;

    // 1. Block math: $$ ... $$
    let text = md.replace(/\$\$([\s\S]*?)\$\$/g, (_, tex) => {
      const id = `__PPMATH_BLOCK_${tokenIndex++}__`;
      mathTokens.push({ id, raw: tex, block: true });
      return id;
    });

    // 2. Block math: \[ ... \]
    text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, tex) => {
      const id = `__PPMATH_BLOCK_${tokenIndex++}__`;
      mathTokens.push({ id, raw: tex, block: true });
      return id;
    });

    // 3. Inline math: \( ... \)
    text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, tex) => {
      const id = `__PPMATH_INLINE_${tokenIndex++}__`;
      mathTokens.push({ id, raw: tex, block: false });
      return id;
    });

    // 4. Inline math: $ ... $ (excluding escaped \$)
    text = text.replace(/(?<!\\)\$((?:[^\$\n\\]|\\.)+)\$/g, (_, tex) => {
      const id = `__PPMATH_INLINE_${tokenIndex++}__`;
      mathTokens.push({ id, raw: tex, block: false });
      return id;
    });

    // Escape remaining non-math text for XHTML
    let safe = escapeXml(text);

    // Basic markdown typography
    safe = safe
      .replace(/### (.*?)(?:\n|$)/g, "<html:h4>$1</html:h4>")
      .replace(/## (.*?)(?:\n|$)/g, "<html:h3>$1</html:h3>")
      .replace(/\*\*(.*?)\*\*/g, "<html:strong>$1</html:strong>")
      .replace(/\*(.*?)\*/g, "<html:em>$1</html:em>")
      .replace(/`([^`]+)`/g, "<html:code>$1</html:code>")
      .replace(/\n\n/g, "<html:p></html:p>")
      .replace(/\n/g, "<html:br/>");

    // Replace math tokens with KaTeX MathML
    for (const token of mathTokens) {
      let rendered = "";
      try {
        rendered = katex.renderToString(token.raw.trim(), {
          displayMode: token.block,
          output: "mathml",
          throwOnError: false,
        });
      } catch (err) {
        rendered = `<span class="katex-fallback">${escapeXml(token.raw.trim())}</span>`;
      }

      const mathHtml = token.block
        ? `<html:div class="paperpilot-math-block" style="display:block; margin:6px 0; text-align:center; overflow-x:auto;">${rendered}</html:div>`
        : `<html:span class="paperpilot-math-inline" style="display:inline-block; vertical-align:middle;">${rendered}</html:span>`;

      safe = safe.replace(token.id, mathHtml);
    }

    return safe;
  }

  // Test Case 1: Inline Math $E=mc^2$
  const input1 = "根据狭义相对论，质能等价公式为 $E=mc^2$ 成立。";
  const out1 = renderMarkdownContent(input1);
  assert(!out1.includes("$E=mc^2$"), "Raw '$E=mc^2$' delimiter must not appear in output");
  assert(out1.includes("paperpilot-math-inline"), "Inline math container must exist");
  assert(out1.includes("<math xmlns="), "MathML element must be rendered");
  console.log("✅ Inline math $...$ stripped and rendered as MathML.");

  // Test Case 2: Block Math $$ ... $$
  const input2 = "高斯积分形式如下：\n$$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$\n具有良好的对称性。";
  const out2 = renderMarkdownContent(input2);
  assert(!out2.includes("$$"), "Raw '$$' delimiter must not appear in output");
  assert(out2.includes("paperpilot-math-block"), "Block math container must exist");
  assert(out2.includes("<math xmlns="), "Block MathML element must be rendered");
  console.log("✅ Block math $$...$$ stripped and rendered as block MathML.");

  // Test Case 3: Parenthesis/bracket Delimiters \(...\) and \[...\]
  const input3 = "在线性系统中，若 \\(f(x) \\le M\\)，则矩阵方程满足：\n\\[ A x = b \\]";
  const out3 = renderMarkdownContent(input3);
  assert(!out3.includes("\\("), "Raw '\\(' must not appear in output");
  assert(!out3.includes("\\)"), "Raw '\\)' must not appear in output");
  assert(!out3.includes("\\["), "Raw '\\[' must not appear in output");
  assert(!out3.includes("\\]"), "Raw '\\]' must not appear in output");
  assert(out3.includes("paperpilot-math-inline"), "Inline \\(...\\) must produce inline math");
  assert(out3.includes("paperpilot-math-block"), "Block \\[...\\] must produce block math");
  console.log("✅ Delimiters \\(...\\) and \\[...\\] stripped and converted to MathML.");

  // Test Case 4: Escaped dollar \$ must not trigger math
  const input4 = "该项研究预算约为 \\$1000 美元。";
  const out4 = renderMarkdownContent(input4);
  assert(!out4.includes("paperpilot-math-inline"), "Escaped \\$ must not trigger inline math");
  console.log("✅ Escaped dollar \\$ properly excluded from math parsing.");
}

try {
  testMathRendering();
  console.log("ALL MATH RENDERING TESTS PASSED.\n");
} catch (err) {
  console.error("❌ Test failed:", err);
  process.exit(1);
}
