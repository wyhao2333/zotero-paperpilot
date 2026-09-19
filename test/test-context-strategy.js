const assert = require("assert");

/**
 * Test: Context Strategy & Translation Context
 * Tests hasFullPaperIntent detection, local selection context vs full paper retrieval,
 * and translation context scoping.
 */
function testContextStrategy() {
  console.log("=== [Test 2] Context Strategy & Translation Context ===");

  // 1. hasFullPaperIntent Logic
  const fullPaperKeywords = [
    "全文",
    "全篇",
    "整篇",
    "全书",
    "整篇论文",
    "整篇文章",
    "全篇文献",
    "本文主要",
    "本文讲了什么",
    "总体",
    "总结全文",
    "整体架构",
    "文章大意",
    "主要贡献",
    "核心创新",
    "全篇讲了",
    "文章总体",
    "overall",
    "entire paper",
    "whole paper",
    "full paper",
    "throughout the paper",
    "main contribution",
    "summary of the paper",
    "paper as a whole",
  ];

  function hasFullPaperIntent(question) {
    if (!question) return false;
    const lower = question.toLowerCase();
    return fullPaperKeywords.some((kw) => lower.includes(kw));
  }

  // Positive full-paper queries
  assert.strictEqual(hasFullPaperIntent("请总结整篇论文的核心创新点"), true);
  assert.strictEqual(hasFullPaperIntent("本文主要解决了什么科学问题？"), true);
  assert.strictEqual(hasFullPaperIntent("What is the main contribution of the whole paper?"), true);
  assert.strictEqual(hasFullPaperIntent("Summarize the paper as a whole"), true);
  assert.strictEqual(hasFullPaperIntent("整个文章总体架构是怎样的"), true);

  // Negative (focused/local queries)
  assert.strictEqual(hasFullPaperIntent("公式(3)里的参数 \\lambda 具体代表什么？"), false);
  assert.strictEqual(hasFullPaperIntent("为什么这里采用 AdamW 而不是 SGD？"), false);
  assert.strictEqual(hasFullPaperIntent("Explain why this theorem requires convexity."), false);
  assert.strictEqual(hasFullPaperIntent("这句话怎么理解？"), false);
  console.log("✅ hasFullPaperIntent accurately separates global queries from focused quote queries.");

  // 2. Local vs Full-Paper Context Routing
  const mockDocument = {
    attachmentID: 101,
    text: `
[Introduction]
Deep learning models have expanded rapidly across computer vision and natural language processing.
However, their interpretability remains a core bottleneck in clinical decision-making systems.

[Methods]
We propose a novel attention-guided attribution mechanism named NeuroPilot.
Specifically, for an input embedding x and query vector q, the attention weights are formulated as:
A(x, q) = softmax(q^T W x / sqrt(d)).
Here, parameter lambda controls the sparsity constraint applied to the diagonal elements.

[Experiments]
Experiments on MIMIC-IV demonstrate a 14% improvement in predictive accuracy.
Baseline comparisons with standard transformers show substantial speedups during inference.

[Conclusion]
In conclusion, NeuroPilot bridges neural representation with clinical semantic explanations.
    `.trim(),
    chunks: [
      "Deep learning models have expanded rapidly across computer vision...",
      "We propose a novel attention-guided attribution mechanism named NeuroPilot...",
      "Experiments on MIMIC-IV demonstrate a 14% improvement...",
      "In conclusion, NeuroPilot bridges neural representation...",
    ],
  };

  function getLocalSelectionContext(doc, selectedText) {
    if (!doc || !selectedText) return "";
    const cleanSel = selectedText.trim().replace(/\s+/g, " ");
    const sample = cleanSel.length > 40 ? cleanSel.substring(0, 40) : cleanSel;
    const lowerFull = doc.text.toLowerCase().replace(/\s+/g, " ");
    const idx = lowerFull.indexOf(sample.toLowerCase());
    if (idx !== -1) {
      const start = Math.max(0, idx - 600);
      const end = Math.min(doc.text.length, idx + sample.length + 800);
      return doc.text.substring(start, end).trim();
    }
    return doc.chunks[0] || "";
  }

  function getFullPaperContext(doc, question, selectedText) {
    return doc.chunks.map((c, i) => `【论文片段 ${i + 1}】:\n${c}`).join("\n\n");
  }

  function getRelevantContext(doc, question, quote) {
    const cleanQuote = quote ? quote.trim() : "";
    if (cleanQuote && !hasFullPaperIntent(question)) {
      return { type: "local", context: getLocalSelectionContext(doc, cleanQuote) };
    }
    return { type: "full", context: getFullPaperContext(doc, question, cleanQuote) };
  }

  // Case A: Quote present + normal question -> Local context ONLY
  const quoteTarget = "parameter lambda controls the sparsity constraint";
  const normalResult = getRelevantContext(mockDocument, "这里的 lambda 是如何调节稀疏度的？", quoteTarget);
  assert.strictEqual(normalResult.type, "local");
  assert(normalResult.context.includes("A(x, q) = softmax"));
  assert(normalResult.context.includes("parameter lambda controls"));
  assert(!normalResult.context.includes("【论文片段 4】"), "Local context must not contain all segmented chunks");
  console.log("✅ Case A PASS: Quote + focused question routes to local passage context.");

  // Case B: Quote present + full-paper intent -> Full paper context
  const fullIntentResult = getRelevantContext(mockDocument, "结合这句话谈谈整篇论文的核心创新与主要贡献", quoteTarget);
  assert.strictEqual(fullIntentResult.type, "full");
  assert(fullIntentResult.context.includes("【论文片段 1】"));
  assert(fullIntentResult.context.includes("【论文片段 4】"));
  console.log("✅ Case B PASS: Quote + full-paper intent routes to full document retrieval.");

  // Case C: No quote -> Full paper context
  const noQuoteResult = getRelevantContext(mockDocument, "本文主要提出了什么新架构？", "");
  assert.strictEqual(noQuoteResult.type, "full");
  console.log("✅ Case C PASS: No quote routes to full document retrieval.");

  // 3. Translation Context extraction
  function getTranslationContext(doc, selectedText) {
    if (!doc || !selectedText) return "";
    const cleanSel = selectedText.trim().replace(/\s+/g, " ");
    const sample = cleanSel.length > 30 ? cleanSel.substring(0, 30) : cleanSel;
    const lowerFull = doc.text.toLowerCase().replace(/\s+/g, " ");
    const idx = lowerFull.indexOf(sample.toLowerCase());
    if (idx !== -1) {
      const start = Math.max(0, idx - 300);
      const end = Math.min(doc.text.length, idx + sample.length + 300);
      return doc.text.substring(start, end).trim();
    }
    return "";
  }

  const transSelection = "interpretability remains a core bottleneck";
  const transCtx = getTranslationContext(mockDocument, transSelection);
  assert(transCtx.includes("Deep learning models have expanded"));
  assert(transCtx.includes("clinical decision-making systems"));
  assert(transCtx.length < 800, "Translation context should be a concise local window (~600 chars total)");
  console.log("✅ Translation context provides concise local window for term disambiguation.");
}

try {
  testContextStrategy();
  console.log("ALL CONTEXT STRATEGY TESTS PASSED.\n");
} catch (err) {
  console.error("❌ Test failed:", err);
  process.exit(1);
}
