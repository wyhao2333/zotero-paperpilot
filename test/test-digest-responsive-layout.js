const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("=== [Test] Digest Responsive Layout & List Item Wrapping ===");

const cssSrc = fs.readFileSync(path.join("addon", "style.css"), "utf-8");

// 1. Check style.css for AI message full-width stretch
console.log("-> Check 1: AI message card stretching in addon/style.css");
assert(
  cssSrc.includes(".paperpilot-msg.ai") &&
  cssSrc.includes("align-self: stretch;") &&
  cssSrc.includes("width: 100%;"),
  ".paperpilot-msg.ai must have align-self: stretch and width: 100% to prevent intrinsic width clipping"
);
console.log("  PASS: .paperpilot-msg.ai stretching rules verified.");

// 2. Check message content containers
console.log("-> Check 2: Content container bounds in addon/style.css");
assert(
  cssSrc.includes(".paperpilot-msg-content") &&
  cssSrc.includes("box-sizing: border-box;"),
  ".paperpilot-msg-content must have box-sizing: border-box and width constraints"
);

// 3. Strict Rule Block Inspection: ul / ol width & padding
console.log("-> Check 3: Scoped ul / ol container bounds and padding");
const ulOlRuleMatch = cssSrc.match(
  /\.paperpilot-msg\.ai\s+\.msg-content\s+ul\s*,\s*\.paperpilot-msg\.ai\s+\.msg-content\s+ol\s*\{([^}]*)\}/
);
assert(ulOlRuleMatch, "Missing scoped AI ul/ol rule: .paperpilot-msg.ai .msg-content ul, .paperpilot-msg.ai .msg-content ol");
const ulOlRule = ulOlRuleMatch[1];
assert(/width\s*:\s*100%\s*;/.test(ulOlRule), "ul/ol inside AI messages must specify width: 100%");
assert(/max-width\s*:\s*100%\s*;/.test(ulOlRule), "ul/ol inside AI messages must specify max-width: 100%");
assert(/min-width\s*:\s*0\s*;/.test(ulOlRule), "ul/ol inside AI messages must specify min-width: 0");
assert(/box-sizing\s*:\s*border-box\s*;/.test(ulOlRule), "ul/ol inside AI messages must specify box-sizing: border-box");
assert(/padding-inline-start\s*:\s*1\.4em\s*;/.test(ulOlRule), "ul/ol inside AI messages must specify padding-inline-start: 1.4em");
console.log("  PASS: Scoped ul/ol width constraints and responsive padding verified.");

// 4. Strict Rule Block Inspection: li white-space & wrapping
console.log("-> Check 4: Scoped li white-space reset and emergency wrap");
const liRuleMatch = cssSrc.match(
  /\.paperpilot-msg\.ai\s+\.msg-content\s+li\s*\{([^}]*)\}/
);
assert(liRuleMatch, "Missing scoped AI list item rule: .paperpilot-msg.ai .msg-content li");
const liRule = liRuleMatch[1];

assert(
  /white-space\s*:\s*normal\s*!important\s*;/.test(liRule),
  "AI list items must explicitly override inherited Zotero host nowrap with 'white-space: normal !important'"
);
assert(
  /overflow-wrap\s*:\s*anywhere\s*!important\s*;/.test(liRule),
  "AI list items must enforce emergency line breaking with 'overflow-wrap: anywhere !important'"
);
assert(
  /word-break\s*:\s*break-word\s*;/.test(liRule),
  "AI list items must include 'word-break: break-word'"
);
assert(
  /min-width\s*:\s*0\s*;/.test(liRule),
  "AI list items must set min-width: 0"
);
assert(
  /max-width\s*:\s*100%\s*;/.test(liRule),
  "AI list items must set max-width: 100%"
);
assert(
  /box-sizing\s*:\s*border-box\s*;/.test(liRule),
  "AI list items must set box-sizing: border-box"
);
console.log("  PASS: Scoped li white-space: normal !important and wrapping verified.");

// 5. Strict Rule Block Inspection: li > p nested paragraph wrapping
console.log("-> Check 5: Scoped li > p nested paragraph rule");
const liPRuleMatch = cssSrc.match(
  /\.paperpilot-msg\.ai\s+\.msg-content\s+li\s*>\s*p\s*\{([^}]*)\}/
);
assert(liPRuleMatch, "Missing scoped AI list paragraph rule: .paperpilot-msg.ai .msg-content li > p");
const liPRule = liPRuleMatch[1];
assert(
  /white-space\s*:\s*normal\s*!important\s*;/.test(liPRule),
  "Nested paragraphs inside list items must have 'white-space: normal !important'"
);
assert(
  /overflow-wrap\s*:\s*anywhere\s*!important\s*;/.test(liPRule),
  "Nested paragraphs inside list items must have 'overflow-wrap: anywhere !important'"
);
assert(
  /word-break\s*:\s*break-word\s*;/.test(liPRule),
  "Nested paragraphs inside list items must have 'word-break: break-word'"
);
console.log("  PASS: Scoped li > p paragraph wrapping verified.");

// 6. Regression Case: Host white-space: nowrap override simulation
console.log("-> Check 6: Host white-space: nowrap override simulation");
function simulateCssCascade(hostStyle, elementRule) {
  const effective = { ...hostStyle };
  // Parse element rule declarations
  const declarations = elementRule.split(";").map((s) => s.trim()).filter(Boolean);
  for (const decl of declarations) {
    const [prop, val] = decl.split(":").map((s) => s.trim());
    if (prop && val) {
      // If element rule has !important, it always wins
      if (val.includes("!important")) {
        effective[prop] = val.replace("!important", "").trim();
      } else if (!hostStyle[prop] || !hostStyle[prop].includes("!important")) {
        effective[prop] = val;
      }
    }
  }
  return effective;
}

const simulatedHost = { "white-space": "nowrap" };
const effectiveLiStyle = simulateCssCascade(simulatedHost, liRule);
assert.strictEqual(
  effectiveLiStyle["white-space"],
  "normal",
  "effective white-space on li must be 'normal' even when host has 'nowrap'"
);
assert.strictEqual(
  effectiveLiStyle["overflow-wrap"],
  "anywhere",
  "effective overflow-wrap on li must be 'anywhere'"
);
console.log("  PASS: PaperPilot list items explicitly override inherited Zotero host nowrap.");

// 7. Block elements (code, math, table) responsiveness
console.log("-> Check 7: Code, Math, and Table block bounding");
assert(
  cssSrc.includes(".paperpilot-math-block") && cssSrc.includes("overflow-x: auto;"),
  ".paperpilot-math-block must have overflow-x: auto for horizontal scrollability in narrow sidebars"
);
assert(
  cssSrc.includes("max-width: 100%;") && cssSrc.includes("box-sizing: border-box;"),
  "Blocks must enforce max-width: 100% and box-sizing: border-box"
);
console.log("  PASS: Block element responsive bounding verified.");

// 8. Check panel.ts context caption
console.log("-> Check 8: Context caption in src/modules/sidebar/panel.ts");
const panelSrc = fs.readFileSync(path.join("src", "modules", "sidebar", "panel.ts"), "utf-8");
assert(
  panelSrc.includes("结合 PDF 上下文"),
  "panel.ts must display '结合 PDF 上下文' rather than claiming full-text reasoning"
);
assert(
  !panelSrc.includes("结合 PDF 全文推理"),
  "panel.ts must NOT display '结合 PDF 全文推理'"
);
console.log("  PASS: Context caption updated to '结合 PDF 上下文'.");

console.log("✅ Digest Responsive Layout & List Item Wrapping verification complete.");
