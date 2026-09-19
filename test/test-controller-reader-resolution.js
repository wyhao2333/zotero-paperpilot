const assert = require("assert");
const fs = require("fs");
const esbuild = require("esbuild");

console.log("=== [Test] Controller Reader Tab Resolution & Context Safety ===");

// 1. Compile PaperPilotSidebarController
const buildResult = esbuild.buildSync({
  entryPoints: ["src/modules/sidebar/controller.ts"],
  bundle: true,
  format: "cjs",
  write: false,
  platform: "node",
});

const moduleObj = { exports: {} };
const runner = new Function("module", "exports", "require", buildResult.outputFiles[0].text);
runner(moduleObj, moduleObj.exports, require);
const { PaperPilotSidebarController } = moduleObj.exports;

assert(PaperPilotSidebarController, "PaperPilotSidebarController must be exported");

// Test 1: resolveReaderTabID resolution order
console.log("-> Test 1: resolveReaderTabID priority resolution");
const winMock = {
  Zotero_Tabs: {
    selectedID: "tab_window_selected",
  },
};

// Priority 1: reader._tabID
const reader1 = { _tabID: "tab_reader_internal_1" };
assert.strictEqual(
  PaperPilotSidebarController.resolveReaderTabID(winMock, reader1),
  "tab_reader_internal_1",
  "reader._tabID must take highest priority"
);

// Priority 2: reader.tabID
const reader2 = { tabID: "tab_reader_property_2" };
assert.strictEqual(
  PaperPilotSidebarController.resolveReaderTabID(winMock, reader2),
  "tab_reader_property_2",
  "reader.tabID must be respected when _tabID is absent"
);

// Priority 3: win.Zotero_Tabs.selectedID
assert.strictEqual(
  PaperPilotSidebarController.resolveReaderTabID(winMock, null),
  "tab_window_selected",
  "win.Zotero_Tabs.selectedID must be used as fallback"
);

// Priority 4: Empty string when nothing is available
assert.strictEqual(
  PaperPilotSidebarController.resolveReaderTabID(null, null),
  "",
  "Empty string when no window or reader is available"
);
console.log("  PASS: resolveReaderTabID resolution priority verified.");

// Test 2: Source inspection to ensure _activeItemContext guards against tab crosstalk
console.log("-> Test 2: _activeItemContext tabID mismatch prevention");
const controllerTs = fs.readFileSync("src/modules/sidebar/controller.ts", "utf-8");
assert(
  controllerTs.includes("active.tabID === tabID"),
  "controller.ts must check active.tabID === tabID to prevent cross-PDF crosstalk"
);
assert(
  !/if\s*\([^)]*pendingActions\.has[^)]*\)\s*\{\s*[^}]*return true;/.test(controllerTs),
  "controller.ts must not have fake success returns"
);
console.log("  PASS: Cross-tab crosstalk defense and strict delivery confirmed.");

console.log("=== All Controller Reader Resolution tests passed successfully ===");
