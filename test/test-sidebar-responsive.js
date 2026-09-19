const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("=== [Test] Sidebar Responsive & ResizeObserver Safety ===");

// 1. Check panel.ts for ResizeObserver sandbox safety
console.log("-> Check 1: ResizeObserver sandbox safety in panel.ts");
const panelSrc = fs.readFileSync(path.join("src", "modules", "sidebar", "panel.ts"), "utf-8");

// Must NOT use naked 'new ResizeObserver('
assert(!/new\s+ResizeObserver\s*\(/.test(panelSrc), "Must NOT use naked 'new ResizeObserver('");

// Must access via window / ownerDocument.defaultView
assert(
  panelSrc.includes("ResizeObserverCtor") && panelSrc.includes("defaultView"),
  "Must safely retrieve ResizeObserver constructor from defaultView"
);

// Must disconnect in destroy()
assert(
  panelSrc.includes("this.resizeObserver.disconnect()") || panelSrc.includes("this.resizeObserver?.disconnect()"),
  "destroy() must disconnect resizeObserver"
);
console.log("  PASS: ResizeObserver constructor scoping and lifecycle cleanup verified.");

// 2. Check responsive layout thresholds in panel.ts
console.log("-> Check 2: Responsive layout thresholds in panel.ts");
assert(panelSrc.includes("updateResponsiveLayout"), "panel.ts must have updateResponsiveLayout method");
assert(panelSrc.includes("360"), "panel.ts must check narrow threshold < 360");
assert(panelSrc.includes("520"), "panel.ts must check compact threshold < 520");
assert(panelSrc.includes('"narrow"') && panelSrc.includes('"compact"') && panelSrc.includes('"normal"'), "Three layout modes verified");
console.log("  PASS: Three-tier responsive mode logic (normal, compact, narrow) verified.");

// 3. Check CSS rules in addon/style.css
console.log("-> Check 3: CSS responsive rules in addon/style.css");
const cssSrc = fs.readFileSync(path.join("addon", "style.css"), "utf-8");

// Check classes exist
assert(cssSrc.includes(".paperpilot-sidebar.paperpilot-compact"), "CSS must define .paperpilot-compact rules");
assert(cssSrc.includes(".paperpilot-sidebar.paperpilot-narrow"), "CSS must define .paperpilot-narrow rules");

// Check min-width: 0 on major containers
const requiredZeroMinWidth = [
  ".paperpilot-sidebar",
  ".paperpilot-header",
  ".paperpilot-msg",
  ".paperpilot-msg-content",
  ".paperpilot-chat-history",
  ".paperpilot-session-row",
  ".paperpilot-domain-row",
  ".paperpilot-input-box",
  ".paperpilot-textarea"
];

for (const sel of requiredZeroMinWidth) {
  assert(cssSrc.includes(sel), `CSS must define selector ${sel}`);
}
assert(cssSrc.includes("min-width: 0;"), "CSS must enforce min-width: 0 on containers");
assert(cssSrc.includes("overflow-wrap: anywhere;"), "CSS must enforce overflow-wrap: anywhere");

// Check math container overflow handling
assert(cssSrc.includes(".paperpilot-math-block"), "CSS must define .paperpilot-math-block");
assert(cssSrc.includes("overflow-x: auto;"), "Math blocks must allow horizontal scroll");
assert(cssSrc.includes("overflow-y: hidden;"), "Math blocks must hide vertical scroll");
assert(cssSrc.includes(".paperpilot-chat-history") && cssSrc.includes("overflow-x: hidden;"), "Chat history must prevent whole-pane horizontal scroll");

console.log("  PASS: CSS responsive classes, min-width: 0, text wrapping, and math overflow verified.");

console.log("=== All Sidebar Responsive tests passed successfully ===");
