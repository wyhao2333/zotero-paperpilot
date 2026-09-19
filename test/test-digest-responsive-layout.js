const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("=== [Test] Digest Responsive Layout & Context Caption ===");

// 1. Check style.css for AI message full-width stretch
console.log("-> Check 1: AI message card stretching in addon/style.css");
const cssSrc = fs.readFileSync(path.join("addon", "style.css"), "utf-8");

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

// 3. Check responsive list padding replacing browser default 40px
console.log("-> Check 3: Responsive em-based list padding");
assert(
  cssSrc.includes("padding-inline-start: 1.4em;") || cssSrc.includes("padding-left: 1.4em;"),
  "Lists inside AI messages must use responsive em padding instead of browser 40px default"
);
assert(
  cssSrc.includes("overflow-wrap: anywhere;") && cssSrc.includes("word-break: break-word;"),
  "List items and text must have overflow-wrap: anywhere and word-break: break-word"
);
console.log("  PASS: List padding and word wrapping verified.");

// 4. Check block elements (code, math, table) responsiveness
console.log("-> Check 4: Code, Math, and Table block bounding");
assert(
  cssSrc.includes(".paperpilot-math-block") && cssSrc.includes("overflow-x: auto;"),
  ".paperpilot-math-block must have overflow-x: auto for horizontal scrollability in narrow sidebars"
);
assert(
  cssSrc.includes("max-width: 100%;") && cssSrc.includes("box-sizing: border-box;"),
  "Blocks must enforce max-width: 100% and box-sizing: border-box"
);
console.log("  PASS: Block element responsive bounding verified.");

// 5. Check panel.ts context caption
console.log("-> Check 5: Context caption in src/modules/sidebar/panel.ts");
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

console.log("✅ Digest Responsive Layout verification complete.");
