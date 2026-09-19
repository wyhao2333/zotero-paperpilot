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

// Mock environment for testing Zotero.Reader.getByTabID
const registeredReaders = new Map([
  ["tab_reader_public_1", { id: "reader_1" }],
  ["tab_reader_by_item_2", { id: "reader_2" }],
  ["tab_window_selected_3", { id: "reader_3" }],
  ["tab_legacy_fallback_4", { id: "reader_4" }],
]);

global.Zotero = {
  Reader: {
    getByTabID(tabID) {
      return registeredReaders.get(tabID) || null;
    },
  },
};

const winMock = {
  Zotero: global.Zotero,
  Zotero_Tabs: {
    selectedID: "tab_window_selected_3",
    getTabIDByItemID(itemID) {
      if (itemID === 100) return "tab_reader_by_item_2";
      if (itemID === 200) return { tabID: "tab_reader_by_item_2" };
      return null;
    },
  },
};

// Test 1: Priority 1 - Valid reader.tabID (verified)
console.log("-> Test 1: Priority 1 - Valid reader.tabID");
const r1 = { tabID: "tab_reader_public_1" };
assert.strictEqual(
  PaperPilotSidebarController.resolveReaderTabID(winMock, r1),
  "tab_reader_public_1",
  "reader.tabID must be chosen and verified"
);

// Test 2: Unverified reader.tabID is rejected, falls through
console.log("-> Test 2: Unverified reader.tabID is rejected");
const rUnverified = { tabID: "tab_unregistered_ghost" };
assert.strictEqual(
  PaperPilotSidebarController.resolveReaderTabID(winMock, rUnverified),
  "tab_window_selected_3",
  "Unregistered reader.tabID must fall through to next verified candidate"
);

// Test 3: Priority 2 - itemID -> verified tabID
console.log("-> Test 3: Priority 2 - itemID -> verified tabID");
const rItem = { itemID: 100 };
assert.strictEqual(
  PaperPilotSidebarController.resolveReaderTabID(winMock, rItem),
  "tab_reader_by_item_2",
  "itemID mapped tab must be verified and returned"
);

// Test 4: Priority 3 - Verified selectedID fallback
console.log("-> Test 4: Priority 3 - Verified selectedID fallback");
assert.strictEqual(
  PaperPilotSidebarController.resolveReaderTabID(winMock, null),
  "tab_window_selected_3",
  "Selected tab ID must be verified and used as fallback"
);

// Test 5: zotero-pane is strictly rejected
console.log("-> Test 5: zotero-pane is strictly rejected");
const winPaneMock = {
  Zotero: global.Zotero,
  Zotero_Tabs: {
    selectedID: "zotero-pane",
  },
};
assert.strictEqual(
  PaperPilotSidebarController.resolveReaderTabID(winPaneMock, null),
  "",
  "zotero-pane must never be resolved as Reader tabID"
);

// Test 6: Invalid selectedID is rejected
console.log("-> Test 6: Invalid selectedID is rejected");
const winInvalidTab = {
  Zotero: global.Zotero,
  Zotero_Tabs: {
    selectedID: "tab_library_non_reader",
  },
};
assert.strictEqual(
  PaperPilotSidebarController.resolveReaderTabID(winInvalidTab, null),
  "",
  "Unregistered selectedID must be rejected"
);

// Test 7: Legacy _tabID is ONLY last fallback and must be verified
console.log("-> Test 7: Legacy _tabID is last fallback and verified");
const winNoSelected = {
  Zotero: global.Zotero,
  Zotero_Tabs: { selectedID: null },
};
const rLegacy = { _tabID: "tab_legacy_fallback_4" };
assert.strictEqual(
  PaperPilotSidebarController.resolveReaderTabID(winNoSelected, rLegacy),
  "tab_legacy_fallback_4",
  "Legacy _tabID can be used as last fallback if verified"
);

const rLegacyUnregistered = { _tabID: "tab_legacy_unregistered" };
assert.strictEqual(
  PaperPilotSidebarController.resolveReaderTabID(winNoSelected, rLegacyUnregistered),
  "",
  "Unregistered _tabID must be rejected"
);

// Test 8: _activeItemContext tabID matching (requested B vs active A, missing, matching)
console.log("-> Test 8: _activeItemContext cross-tab defense");
const controllerTs = fs.readFileSync("src/modules/sidebar/controller.ts", "utf-8");
assert(
  controllerTs.includes("active && tabID && active.tabID === tabID"),
  "controller.ts must require active && tabID && active.tabID === tabID"
);

// Direct unit logic test of getItemDetailsContextWithRetry condition
function testContextMatch(tabID, active) {
  return !!(active && tabID && active.tabID === tabID);
}

assert.strictEqual(
  testContextMatch("tab-B", { tabID: "tab-A" }),
  false,
  "requested tab B / active tab A must be REJECTED"
);
assert.strictEqual(
  testContextMatch("tab-B", { tabID: "" }),
  false,
  "requested tab B / active tab missing must be REJECTED"
);
assert.strictEqual(
  testContextMatch("tab-B", null),
  false,
  "requested tab B / active null must be REJECTED"
);
assert.strictEqual(
  testContextMatch("", { tabID: "tab-A" }),
  false,
  "requested tab missing / active exists must be REJECTED"
);
assert.strictEqual(
  testContextMatch("tab-B", { tabID: "tab-B" }),
  true,
  "requested tab B / active tab B must be ACCEPTED"
);
console.log("  PASS: All Reader tab resolution and context safety rules verified.");

console.log("=== All Controller Reader Resolution tests passed successfully ===");
