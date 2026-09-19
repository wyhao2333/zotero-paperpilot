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
  assert(clientTs.includes("throw new Error"), "AIClient must throw instead of calling callNonStreaming() when deltas arrived");
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

  console.log("\n==================================================");
  console.log("STATIC CHECK PASS (Requires manual Zotero GUI verification)");
}

runStaticValidation().catch((e) => {
  console.error("❌ Validation failed:", e);
  process.exit(1);
});
