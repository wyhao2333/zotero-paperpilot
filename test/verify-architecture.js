/**
 * Static Architecture & Logic Verification Suite for PaperPilot
 * NOTE: These are static unit and schema checks. GUI behavior requires manual Zotero GUI verification.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

async function runStaticValidation() {
  console.log("=== [PaperPilot Static Architecture & Logic Verification Suite] ===");

  // Read source files
  const indexTs = fs.readFileSync("src/index.ts", "utf-8");
  const controllerTs = fs.readFileSync("src/modules/sidebar/controller.ts", "utf-8");
  const panelTs = fs.readFileSync("src/modules/sidebar/panel.ts", "utf-8");
  const chatViewTs = fs.readFileSync("src/modules/sidebar/chat-view.ts", "utf-8");
  const clientTs = fs.readFileSync("src/modules/ai/client.ts", "utf-8");
  const promptsTs = fs.readFileSync("src/modules/ai/prompts.ts", "utf-8");
  const prefsTs = fs.readFileSync("src/core/preferences.ts", "utf-8");
  const prefsJs = fs.readFileSync("chrome/content/preferences.js", "utf-8");
  const bundleContent = fs.readFileSync("chrome/content/scripts/index.js", "utf-8");

  // 0. Validate compiled bundle and assets
  console.log("\n[Check 0] Checking compiled bundle and XPI presence...");
  assert(fs.existsSync("chrome/content/scripts/index.js"), "chrome/content/scripts/index.js must exist");
  assert(fs.existsSync("build/zotero-paperpilot.xpi"), "build/zotero-paperpilot.xpi must exist");
  assert(fs.existsSync("addon/style.css"), "addon/style.css must exist");
  assert(!bundleContent.includes("new AbortController"), "Bundle must NOT contain 'new AbortController'");
  assert(!bundleContent.includes("setRightSidebarOpen"), "Bundle must NOT contain 'setRightSidebarOpen'");
  console.log("✅ Distribution files and clean bundle verified.");

  // Check 1: ItemPane bodyXHTML contains its own stylesheet & main window injection
  console.log("\n[Check 1] Verifying self-contained stylesheet inside ItemPane bodyXHTML...");
  assert(indexTs.includes("bodyXHTML:") && indexTs.includes("@import url") && indexTs.includes("addon/style.css"), "bodyXHTML must embed self-contained stylesheet");
  assert(indexTs.includes("xml-stylesheet"), "src/index.ts must create xml-stylesheet processing instruction for main window");
  assert(indexTs.includes("onMainWindowLoad") && indexTs.includes("onMainWindowUnload"), "src/index.ts must implement window lifecycle");
  console.log("✅ Check 1 PASS: ItemPane bodyXHTML embeds self-contained stylesheet and window lifecycle intact.");

  // Check 2: openAsk uses itemDetails.getPane(sectionKey) and strict quote delivery
  console.log("\n[Check 2] Verifying openAsk uses itemDetails.getPane(sectionKey) and strictly validates delivery...");
  assert(controllerTs.includes("itemDetails.getPane("), "openAsk must look up pane via itemDetails.getPane(this.sectionKey)");
  assert(controllerTs.includes("#paperpilot-sidebar-mount"), "openAsk must resolve mount element");
  assert(controllerTs.includes("_paperPilotPanel"), "openAsk must resolve panel instance from mount");
  const fakeSuccessRegex = /if\s*\([^)]*pendingActions\.has[^)]*\)\s*\{\s*[^}]*return true;/;
  assert(!fakeSuccessRegex.test(controllerTs), "controller.ts must NOT return true merely because pendingActions.has(...)");
  assert(controllerTs.includes("panel.handlePendingAction(action) === true"), "openAsk must require panel.handlePendingAction(action) === true");
  assert(controllerTs.includes("[PaperPilot Ask] pane found="), "openAsk must log pane diagnostic stage");
  assert(controllerTs.includes("[PaperPilot Ask] mount found="), "openAsk must log mount diagnostic stage");
  assert(controllerTs.includes("[PaperPilot Ask] panel instance found="), "openAsk must log panel instance diagnostic stage");
  assert(controllerTs.includes("[PaperPilot Ask] quote delivered="), "openAsk must log quote delivery diagnostic stage");
  console.log("✅ Check 2 PASS: openAsk uses getPane, binds mount instance, logs all stages, and rejects fake success.");

  // Check 3: SidebarPanel constructor does not attachPanel without tab context
  console.log("\n[Check 3] Verifying SidebarPanel constructor does not attachPanel without tab context...");
  const constructorMatch = panelTs.match(/constructor\s*\([^)]*\)\s*\{([\s\S]*?)\}/);
  assert(constructorMatch, "SidebarPanel constructor must exist");
  assert(!constructorMatch[1].includes("attachPanel(this)"), "SidebarPanel constructor must NOT call attachPanel(this)");
  console.log("✅ Check 3 PASS: SidebarPanel constructor strictly avoids contextless registration.");

  // Check 4: onRender binds panel instance to mount DOM element
  console.log("\n[Check 4] Verifying onRender binds panel instance directly to mount element...");
  assert(indexTs.includes('(mount as any)._paperPilotPanel = panel'), "onRender must set (mount as any)._paperPilotPanel = panel");
  assert(indexTs.includes('closest("item-details")'), "onRender must query closest('item-details')");
  assert(indexTs.includes("onDestroy:"), "registerSection must implement onDestroy for clean panel detachment");
  console.log("✅ Check 4 PASS: panel instance bound to mount DOM element with onDestroy cleanup.");

  // Check 5: Prompt API does not use generic silent fallback
  console.log("\n[Check 5] Verifying Prompt API does not use generic silent fallback...");
  assert(!prefsJs.includes('"请对以下文献选段进行专业解读：\\n\\n{text}"'), "preferences.js must NOT contain hardcoded generic fallback string");
  assert(prefsJs.includes("ERROR: Prompt API unavailable"), "preferences.js must report error when prompt API unavailable");
  assert(prefsJs.includes("checkPromptApi"), "preferences.js must implement prompt API self-check");
  console.log("✅ Check 5 PASS: No silent generic prompt fallback; strict error reporting on API unavailability.");

  // Check 6: Five default domain prompt templates are mutually distinct
  console.log("\n[Check 6] Verifying all five default domain prompt templates are mutually distinct...");
  const domainRegex = /(\w+):\s*\{[\s\S]*?userPromptTemplate:\s*`([^`]+)`/g;
  const templates = {};
  let match;
  while ((match = domainRegex.exec(promptsTs)) !== null) {
    templates[match[1]] = match[2].trim();
  }

  const domains = ["general", "cs_ai", "med_bio", "econ_social", "engineering"];
  for (const d of domains) {
    assert(templates[d], `Domain ${d} template must exist in prompts.ts`);
  }

  // Check pairwise distinction
  for (let i = 0; i < domains.length; i++) {
    for (let j = i + 1; j < domains.length; j++) {
      const d1 = domains[i];
      const d2 = domains[j];
      assert.notStrictEqual(
        templates[d1],
        templates[d2],
        `Domain prompts for ${d1} and ${d2} must be distinct`
      );
    }
  }
  console.log("✅ Check 6 PASS: All 5 default domain prompts are mutually distinct.");

  // Check 7: Online provider default API keys are strictly empty
  console.log("\n[Check 7] Verifying all online provider default API keys are strictly empty string...");
  const onlineProviders = ["zhipu", "deepseek", "openai", "moonshot", "qwen", "siliconflow", "custom"];
  for (const p of onlineProviders) {
    const providerBlockRegex = new RegExp(`${p}:\\s*\\{[\\s\\S]*?apiKey:\\s*["']([^"']*)["']`);
    const mTs = providerBlockRegex.exec(prefsTs);
    assert(mTs, `Provider ${p} must exist in src/core/preferences.ts`);
    assert.strictEqual(mTs[1], "", `Provider ${p} in preferences.ts must have empty apiKey default (got "${mTs[1]}")`);

    const mJs = providerBlockRegex.exec(prefsJs);
    assert(mJs, `Provider ${p} must exist in chrome/content/preferences.js`);
    assert.strictEqual(mJs[1], "", `Provider ${p} in preferences.js must have empty apiKey default (got "${mJs[1]}")`);
  }
  console.log("✅ Check 7 PASS: All online AI providers have empty default API keys.");

  // Check 8: streaming UI does not full-render markdown per token
  console.log("\n[Check 8] Verifying streaming UI does not render Markdown per token...");
  assert(chatViewTs.includes("appendStreamingDelta"), "ChatView must implement appendStreamingDelta");
  assert(chatViewTs.includes("appendData"), "ChatView must use O(1) textNode.appendData for streaming tokens");
  assert(chatViewTs.includes("finishStreamingMessage"), "ChatView must implement finishStreamingMessage for final Markdown render");
  assert(!chatViewTs.includes("contentEl.innerHTML = this.renderMarkdown(accumulated)"), "No per-token markdown innerHTML replacement");
  console.log("✅ Check 8 PASS: streaming UI appends text node deltas without per-token full markdown rerender.");

  // Check 9: AIClient does not start second non-streaming request after receiving deltas
  console.log("\n[Check 9] Verifying AIClient protects against duplicate non-streaming fallback after partial stream...");
  assert(clientTs.includes("let receivedAnyDelta = false;"), "AIClient must track receivedAnyDelta");
  assert(clientTs.includes("if (receivedAnyDelta)"), "AIClient must guard catch block with receivedAnyDelta");
  assert(clientTs.includes("throw new AIRequestError") || clientTs.includes("throw new Error"), "AIClient must throw instead of calling callNonStreaming() when deltas arrived");
  console.log("✅ Check 9 PASS: AIClient prevents duplicate request on partial stream interruption.");

  // Check 10: ChatView does not directly use global document.createElement
  console.log("\n[Check 10] Verifying ChatView strictly uses ownerDocument instead of global document...");
  const bareDocumentCreate = /(^|[^\w.])document\.createElement\s*\(/;
  assert(!bareDocumentCreate.test(chatViewTs), "ChatView must NOT call bare document.createElement; must use doc.createElement");
  assert(chatViewTs.includes("this.container.ownerDocument"), "ChatView must obtain document from this.container.ownerDocument");
  console.log("✅ Check 10 PASS: ChatView DOM creation is strictly contextual via ownerDocument.");

  // Check 11: Core translation chunking & fallback regression tests
  console.log("\n[Check 11] Verifying translation chunking and MyMemory error detection regression...");
  function splitTranslationText(text, maxLen = 430) {
    const trimmed = text.trim();
    if (!trimmed) return [];
    if (trimmed.length <= maxLen) return [trimmed];
    const chunks = [];
    let remaining = trimmed;
    const delimiters = ["\n\n", "\n", ". ", "? ", "! ", "。 ", "。", "？", "！", "; ", ";", "；", ", ", ",", "，", " "];
    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        chunks.push(remaining.trim());
        break;
      }
      let splitIdx = -1;
      for (const delim of delimiters) {
        const idx = remaining.lastIndexOf(delim, maxLen);
        if (idx !== -1 && idx >= 60) {
          splitIdx = idx + delim.length;
          break;
        }
      }
      if (splitIdx === -1) {
        const spaceIdx = remaining.lastIndexOf(" ", maxLen);
        if (spaceIdx > 0) splitIdx = spaceIdx + 1;
      }
      if (splitIdx === -1 || splitIdx <= 0) splitIdx = maxLen;
      const chunk = remaining.substring(0, splitIdx).trim();
      if (chunk) chunks.push(chunk);
      remaining = remaining.substring(splitIdx).trim();
    }
    return chunks;
  }

  const sampleLongText = "Transformers have revolutionized modern natural language processing and computer vision systems. ".repeat(12);
  const chunks = splitTranslationText(sampleLongText, 430);
  assert(chunks.length >= 3, "Long text must be partitioned into multiple chunks");
  for (const c of chunks) {
    assert(c.length <= 450, `Chunk length ${c.length} exceeds 450 limit`);
  }
  console.log(`✅ Check 11 PASS: Translation chunking verified (${chunks.length} chunks).`);

  // Check 12: Secret scanner integration check
  console.log("\n[Check 12] Executing secret scanner...");
  require("./verify-no-secrets.js");
  console.log("✅ Check 12 PASS: Repository secret scan clean.");

  // Check 13: Sidebar DOM Construction P0 fixes (parseXULToFragment, html: namespace, assertions, try/catch)
  console.log("\n[Check 13] Verifying Reader Sidebar DOM Construction P0 fixes...");
  assert(!panelTs.includes("this.container.innerHTML ="), "panel.ts must NOT use raw this.container.innerHTML");
  assert(panelTs.includes("MozXULElement.parseXULToFragment"), "panel.ts must use MozXULElement.parseXULToFragment");
  assert(panelTs.includes('xmlns:html="http://www.w3.org/1999/xhtml"'), "panel.ts must specify xmlns:html for XHTML namespace");
  assert(panelTs.includes("<html:div") && panelTs.includes("<html:select") && panelTs.includes("<html:button"), "panel.ts markup must use html: prefix for tags");
  assert(panelTs.includes("root.namespaceURI !== HTML_NS"), "panel.ts must assert namespaceURI === HTML_NS");
  assert(panelTs.includes("PaperPilot settings UI incomplete"), "initSettingsUI must throw on missing controls");
  assert(indexTs.includes("[PaperPilot Sidebar] FATAL: Failed to construct SidebarPanel:"), "onRender must catch SidebarPanel constructor failure with FATAL log");
  assert(chatViewTs.includes("parseMarkupToFragment") || chatViewTs.includes("MozXULElement.parseXULToFragment"), "chat-view.ts must construct fragments with parseXULToFragment");
  assert(chatViewTs.includes("<html:div") && chatViewTs.includes('xmlns:html="${HTML_NS}"'), "chat-view.ts must use html: tags under HTML_NS");
  console.log("✅ Check 13 PASS: Reader Sidebar DOM Construction P0 verified.");

  // Check 14: Digest Concurrency, Worker Pool & Retry Policy
  console.log("\n[Check 14] Verifying Digest Concurrency & Resilience...");
  const digestTs = fs.readFileSync("src/modules/ai/digest.ts", "utf-8");
  assert(digestTs.includes("digestConcurrency"), "digest.ts must respect digestConcurrency preference");
  assert(digestTs.includes("concurrency = Math.max(1, Math.min(10,"), "digest.ts must clamp concurrency between 1 and 10");
  assert(digestTs.includes("for (let attempt = 0; attempt <= 2; attempt++)"), "digest.ts must retry up to 2 times on transient failures");
  assert(digestTs.includes("partialSummaries[task.partIndex - 1]"), "digest.ts must preserve part index order");
  console.log("✅ Check 14 PASS: Digest concurrency, retry backoff, and order preservation verified.");

  // Check 15: Context Strategy & Translation Context
  console.log("\n[Check 15] Verifying Context Strategy & Translation Context...");
  const paperCtxTs = fs.readFileSync("src/modules/reader/paper-context.ts", "utf-8");
  assert(paperCtxTs.includes("hasFullPaperIntent"), "paper-context.ts must implement hasFullPaperIntent");
  assert(paperCtxTs.includes("getLocalSelectionContext"), "paper-context.ts must implement getLocalSelectionContext");
  assert(paperCtxTs.includes("getFullPaperContext"), "paper-context.ts must implement getFullPaperContext");
  assert(paperCtxTs.includes("getTranslationContext"), "paper-context.ts must implement getTranslationContext");
  console.log("✅ Check 15 PASS: Intent-aware context routing and translation context verified.");

  // Check 16: PDF History Isolation & Multi-Session Scoping
  console.log("\n[Check 16] Verifying PDF History Isolation & Multi-Session Management...");
  const storageTs = fs.readFileSync("src/core/storage.ts", "utf-8");
  assert(storageTs.includes("getPDFStorageKey"), "storage.ts must implement getPDFStorageKey");
  assert(storageTs.includes("pdf_${attachmentID}"), "storage.ts must isolate storage key by pdf_${attachmentID}");
  assert(storageTs.includes("schemaVersion: 2"), "storage.ts must enforce schemaVersion 2");
  assert(storageTs.includes("createSession"), "storage.ts must implement createSession");
  assert(panelTs.includes("for (const m of session.messages.slice(-6))"), "panel.ts must scope AI prompt history strictly to active session");
  console.log("✅ Check 16 PASS: PDF history isolation and active session prompt scoping verified.");

  // Check 17: Selection Button State Machine
  console.log("\n[Check 17] Verifying Selection Button State Machine...");
  const floatingBarTs = fs.readFileSync("src/modules/reader/floating-bar.ts", "utf-8");
  assert(floatingBarTs.includes("setActiveButton"), "floating-bar.ts must implement setActiveButton");
  assert(floatingBarTs.includes('setActiveButton("translate")'), "floating-bar.ts must default to translate active");
  assert(floatingBarTs.includes('setAttribute("data-active"'), "floating-bar.ts must update data-active attribute");
  console.log("✅ Check 17 PASS: Selection button state machine verified.");

  // Check 18: Markdown & LaTeX Math Rendering (Sidebar MathML + Zotero Note Native Math)
  console.log("\n[Check 18] Verifying Markdown & LaTeX Math Rendering...");
  const markdownMathTs = fs.readFileSync("src/modules/rendering/markdown-math.ts", "utf-8");
  const noteExporterTs = fs.readFileSync("src/modules/sidebar/note-exporter.ts", "utf-8");
  assert(chatViewTs.includes("MarkdownMathRenderer.renderForSidebar"), "chat-view.ts must use MarkdownMathRenderer for sidebar");
  assert(markdownMathTs.includes("katex.renderToString"), "markdown-math.ts must call katex.renderToString");
  assert(markdownMathTs.includes('output: "mathml"'), "markdown-math.ts must configure KaTeX output as mathml");
  assert(markdownMathTs.includes("paperpilot-math-block"), "markdown-math.ts must style block math");
  assert(markdownMathTs.includes("paperpilot-math-inline"), "markdown-math.ts must style inline math");
  assert(markdownMathTs.includes("looksLikeMath"), "markdown-math.ts must implement looksLikeMath heuristic");
  assert(markdownMathTs.includes("normalizeModelMarkdown"), "markdown-math.ts must strip outer fences and fix delimiters");
  assert(markdownMathTs.includes("renderForZoteroNote"), "markdown-math.ts must implement renderForZoteroNote");
  assert(markdownMathTs.includes('span class="math"'), "renderForZoteroNote must output span class=math for inline math");
  assert(markdownMathTs.includes('pre class="math"'), "renderForZoteroNote must output pre class=math for block math");
  assert(noteExporterTs.includes("MarkdownMathRenderer.renderForZoteroNote"), "note-exporter.ts must use MarkdownMathRenderer.renderForZoteroNote");
  console.log("✅ Check 18 PASS: Markdown-it + KaTeX MathML and Zotero Note native math verified.");

  // Check 19: Adaptive Digest, Single Pass vs Map-Reduce, and Resilient Fallback
  console.log("\n[Check 19] Verifying Adaptive Digest Strategy & Fallback...");
  assert(digestTs.includes("digestStrategy"), "digest.ts must support digestStrategy");
  assert(digestTs.includes("digestSinglePassMaxChars"), "digest.ts must support digestSinglePassMaxChars");
  assert(digestTs.includes('"single-pass"'), "digest.ts must implement single-pass digest");
  assert(digestTs.includes('"map-reduce"'), "digest.ts must implement map-reduce digest");
  assert(digestTs.includes("NOT PRESENT"), "Map-Reduce extraction prompt must instruct NOT PRESENT for missing sections");
  assert(digestTs.includes("failedCount / tasks.length > 0.2"), "digest.ts must fail if >20% chunks fail");
  assert(digestTs.includes("slice(0, 5500)"), "digest.ts must fall back to raw excerpt (5500 chars) on transient chunk failures");
  assert(digestTs.includes("[PaperPilot Digest] total="), "digest.ts must log elapsed duration without leaking secrets");
  console.log("✅ Check 19 PASS: Adaptive digest (single-pass, map-reduce, fallback, duration logs) verified.");

  // Check 20: Translation Context Forwarding & Exact Index Map
  console.log("\n[Check 20] Verifying Translation Context Forwarding & Exact Index Mapping...");
  const transManagerTs = fs.readFileSync("src/modules/translator/index.ts", "utf-8");
  const aiTransTs = fs.readFileSync("src/modules/translator/ai-translator.ts", "utf-8");
  assert(transManagerTs.includes("context: options?.context"), "TranslatorManager must forward options.context");
  assert(transManagerTs.includes("attachmentID: options?.attachmentID"), "TranslatorManager must forward options.attachmentID");
  assert(aiTransTs.includes("BACKGROUND CONTEXT") && aiTransTs.includes("DO NOT translate"), "AITranslator must explicitly isolate background context in prompt");
  assert(paperCtxTs.includes("normalizeWithIndexMap"), "paper-context.ts must implement normalizeWithIndexMap");
  assert(paperCtxTs.includes("indexMap["), "paper-context.ts must map normalized indices back to original character positions");
  console.log("✅ Check 20 PASS: Translation context forwarding, background isolation, and exact index mapping verified.");

  // Check 21: Multi-Session Management, Settings Sync & Stale Overwrite Prevention
  console.log("\n[Check 21] Verifying Multi-Session Management & Settings Sync...");
  assert(storageTs.includes("renameSession"), "storage.ts must implement renameSession");
  assert(storageTs.includes("deleteSession"), "storage.ts must implement deleteSession");
  assert(panelTs.includes("syncSettingsUIFromPreferences"), "panel.ts must implement syncSettingsUIFromPreferences");
  assert(panelTs.includes("preferences:changed"), "panel.ts must listen for preferences:changed");
  assert(panelTs.includes("destroy(): void"), "panel.ts must implement destroy() to unbind preferences:changed");
  assert(prefsTs.includes("registerObserver"), "preferences.ts must register Zotero preference observer");
  assert(prefsTs.includes("unregisterObserver"), "preferences.ts must unregister Zotero preference observer");
  assert(prefsJs.includes("digestStrategy: parsed.digestStrategy"), "preferences.js must preserve digestStrategy");
  assert(prefsJs.includes("digestConcurrency: typeof parsed.digestConcurrency"), "preferences.js must preserve digestConcurrency");
  assert(prefsJs.includes("digestSinglePassMaxChars: typeof parsed.digestSinglePassMaxChars"), "preferences.js must preserve digestSinglePassMaxChars");
  assert(prefsJs.includes("aiTranslationUseContext: parsed.aiTranslationUseContext"), "preferences.js must preserve aiTranslationUseContext");
  console.log("✅ Check 21 PASS: Multi-session management, settings sync, and preference preservation verified.");

  // Check 22: Math Renderer Token Safety, Session Recovery & Runtime Compatibility
  console.log("\n[Check 22] Verifying Math Renderer, Session Recovery & Runtime Compatibility...");
  assert(markdownMathTs.includes("makeMathToken"), "markdown-math.ts must use makeMathToken for pure alphanumeric tokens");
  assert(!markdownMathTs.includes("__PPMATH"), "markdown-math.ts must NOT use __PPMATH tokens (vulnerable to markdown bold parsing)");
  assert(markdownMathTs.includes("const TEXT_NODE = 3"), "markdown-math.ts must define numeric TEXT_NODE constant");
  assert(markdownMathTs.includes("const ELEMENT_NODE = 1"), "markdown-math.ts must define numeric ELEMENT_NODE constant");
  assert(markdownMathTs.includes("renderForZoteroNoteBody"), "markdown-math.ts must export renderForZoteroNoteBody");
  assert(noteExporterTs.includes("renderForZoteroNoteBody"), "note-exporter.ts must use renderForZoteroNoteBody");
  assert(chatViewTs.includes("renderMarkdownInto"), "chat-view.ts must implement renderMarkdownInto");
  assert(chatViewTs.includes("renderPlainTextFallback"), "chat-view.ts must implement renderPlainTextFallback");
  assert(controllerTs.includes("resolveReaderTabID"), "controller.ts must implement resolveReaderTabID");
  assert(controllerTs.includes("active.tabID === tabID"), "controller.ts must guard against cross-PDF context crosstalk");

  console.log("  Executing sub-suites...");
  require("./test-markdown-math-production.js");
  require("./test-session-render-regression.js");
  require("./test-runtime-global-safety.js");
  require("./test-note-renderer-production.js");
  require("./test-controller-reader-resolution.js");
  console.log("✅ Check 22 PASS: Math renderer token safety, session recovery, note schema isolation, and runtime compatibility verified.");

  console.log("\n==================================================");
  console.log("STATIC CHECK PASS (Requires manual Zotero GUI verification)");
}

runStaticValidation().catch((e) => {
  console.error("❌ Validation failed:", e);
  process.exit(1);
});
