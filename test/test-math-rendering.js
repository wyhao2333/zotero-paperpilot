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

  // Test Case 5: Model Markdown Normalization (Fence stripping & math blocks)
  function looksLikeMath(str) {
    const mathSignals = [
      /\\(?:frac|sum|int|sqrt|alpha|beta|gamma|partial|infty|mathbf|mathrm|times|cdot|le|ge|neq|approx|equiv|forall|exists|in|subset| cup|cap|pm|nabla)/,
      /[a-zA-Z]\s*=\s*[a-zA-Z0-9]/,
      /\^[\{\d]/,
      /_[\{\d]/,
    ];
    return mathSignals.some((re) => re.test(str));
  }

  function normalizeModelMarkdown(raw) {
    if (!raw) return "";
    let text = raw.trim();
    const outerFenceRegex = /^```(?:markdown|md)\r?\n([\s\S]*?)\r?\n```$/i;
    const outerMatch = text.match(outerFenceRegex);
    if (outerMatch) {
      text = outerMatch[1].trim();
    } else {
      const untypedOuter = text.match(/^```\r?\n([\s\S]*?)\r?\n```$/);
      if (untypedOuter && !looksLikeMath(untypedOuter[1])) {
        if (/#{1,6}\s+|(?:\r?\n){2,}/.test(untypedOuter[1])) {
          text = untypedOuter[1].trim();
        }
      }
    }

    text = text.replace(/```(?:math|latex|tex)\r?\n([\s\S]*?)\r?\n```/gi, (_, mathCode) => {
      return `\n\n$$\n${mathCode.trim()}\n$$\n\n`;
    });

    text = text.replace(/```\r?\n([\s\S]*?)\r?\n```/g, (match, code) => {
      if (looksLikeMath(code)) {
        return `\n\n$$\n${code.trim()}\n$$\n\n`;
      }
      return match;
    });

    text = text.replace(/\\\s+\(/g, "\\(").replace(/\\\s+\)/g, "\\)");
    text = text.replace(/\\\s+\[/g, "\\[").replace(/\\\s+\]/g, "\\]");
    return text;
  }

  const fencedModelOutput = "```markdown\n# 核心公式\n```latex\n\\int_0^1 x^2 dx = \\frac{1}{3}\n```\n```";
  const normalized = normalizeModelMarkdown(fencedModelOutput);
  assert(!normalized.startsWith("```markdown"), "Outer markdown fence must be stripped");
  assert(normalized.includes("$$\n\\int_0^1 x^2 dx = \\frac{1}{3}\n$$"), "```latex fence must be converted to $$...$$ block");
  console.log("✅ Outer fence stripped and ```latex block converted to $$ math.");

  // Test Case 6: Math-like untyped code block normalization
  const mathCodeBlock = "```\nE = mc^2\n```";
  const normalizedUntyped = normalizeModelMarkdown(mathCodeBlock);
  assert(normalizedUntyped.includes("$$\nE = mc^2\n$$"), "Untyped math block must be converted to $$ math");
  console.log("✅ Untyped code block with math heuristic converted to $$ math.");

  // Test Case 7: Zotero Note Native Math (Schema 9)
  function renderForZoteroNote(md) {
    if (!md) return "";
    let text = normalizeModelMarkdown(md);
    const mathTokens = [];
    let tokenIndex = 0;

    text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, tex) => {
      const id = `__NOTEMATH_BLOCK_${tokenIndex++}__`;
      mathTokens.push({ id, raw: tex.trim(), block: true });
      return id;
    });

    text = text.replace(/(?<!\\)\$((?:[^\$\n\\]|\\.)+)\$/g, (_, tex) => {
      const id = `__NOTEMATH_INLINE_${tokenIndex++}__`;
      mathTokens.push({ id, raw: tex.trim(), block: false });
      return id;
    });

    let safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    safe = safe.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>");
    safe = `<p>${safe}</p>`;

    for (const token of mathTokens) {
      const replacement = token.block
        ? `<pre class="math">$$${token.raw}$$</pre>`
        : `<span class="math">$${token.raw}$</span>`;
      safe = safe.replace(token.id, () => replacement);
    }
    return safe;
  }

  const noteInput = "推导结论：在假定条件下 $a^2 + b^2 = c^2$，且：\n$$\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}$$";
  const noteOutput = renderForZoteroNote(noteInput);
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
