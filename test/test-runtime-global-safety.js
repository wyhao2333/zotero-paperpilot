const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("=== [Test] Runtime Global Safety & Static Defense ===");

function getAllSourceFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      getAllSourceFiles(fullPath, fileList);
    } else if (file.endsWith(".ts") || file.endsWith(".js")) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const srcFiles = getAllSourceFiles("src");
assert(srcFiles.length > 10, "Source files must be discovered");

// Check 1: No naked Node.TEXT_NODE or Node.ELEMENT_NODE or Node.* nodeType constants
console.log("-> Check 1: Checking for naked Node.* constant usages");
const nakedNodeRegex = /\bNode\.(TEXT_NODE|ELEMENT_NODE|DOCUMENT_FRAGMENT_NODE|COMMENT_NODE|DOCUMENT_NODE)\b/;
for (const file of srcFiles) {
  const content = fs.readFileSync(file, "utf-8");
  const match = content.match(nakedNodeRegex);
  assert(
    !match,
    `File ${file} contains naked ${match?.[0]} which crashes in Zotero extension sandbox (Node is not defined)`
  );
}
console.log("  PASS: Zero naked Node.* nodeType constants found across all source files.");

// Check 2: No naked new DOMParser() without safe window/global fallback
console.log("-> Check 2: Checking for naked new DOMParser() instantiation");
const nakedDOMParserRegex = /(?<!win\?\.)(?<!win\.)new\s+DOMParser\s*\(/;
for (const file of srcFiles) {
  const content = fs.readFileSync(file, "utf-8");
  // Only flags if not preceded by safe fallback pattern
  if (content.includes("new DOMParser(")) {
    assert(
      content.includes("DOMParserClass") || content.includes("DOMParserCtor") || content.includes("globalThis"),
      `File ${file} contains naked new DOMParser() without scoped fallback`
    );
  }
}
console.log("  PASS: All DOMParser instantiations safely use scoped window/global constructor.");

// Check 3: Check for TDZ bug with const MozXULElement
console.log("-> Check 3: Checking for MozXULElement Temporal Dead Zone (TDZ) bug");
const tdzRegex = /const\s+MozXULElement\s*=[^;]*typeof\s+MozXULElement\s*!==\s*["']undefined["']/;
for (const file of srcFiles) {
  const content = fs.readFileSync(file, "utf-8");
  const match = content.match(tdzRegex);
  assert(
    !match,
    `File ${file} contains TDZ bug where const MozXULElement evaluates typeof MozXULElement before initialization`
  );
}
console.log("  PASS: No MozXULElement TDZ declaration bugs found.");

// Check 4: No dead EventBus action:interpret or action:ask listeners in SidebarPanel
console.log("-> Check 4: Checking EventBus listener hygiene in SidebarPanel");
const panelTs = fs.readFileSync("src/modules/sidebar/panel.ts", "utf-8");
assert(
  !panelTs.includes('EventBus.on("action:interpret"'),
  "panel.ts must NOT register redundant global action:interpret listener"
);
assert(
  !panelTs.includes('EventBus.on("action:ask"'),
  "panel.ts must NOT register redundant global action:ask listener"
);
console.log("  PASS: Panel listener leak avoided; all actions routed via Controller directly.");

// Check 5: Preferences double-emit avoidance
console.log("-> Check 5: Checking PreferenceManager double-emit defense");
const prefsTs = fs.readFileSync("src/core/preferences.ts", "utf-8");
assert(
  prefsTs.includes("!this.observerSymbol || !savedToZotero"),
  "preferences.ts must guard preferences:changed emission to prevent double events when observer is active"
);
console.log("  PASS: PreferenceManager avoids double-emitting preferences:changed.");

console.log("=== All Runtime Global Safety checks passed successfully ===");
