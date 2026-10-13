const assert = require("assert");
const fs = require("fs");

console.log("=== [Test] Release Manifest & Install Compatibility ===");

// 1. Read manifest.json
assert(fs.existsSync("manifest.json"), "manifest.json must exist");
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf-8"));

// 2. Read updates.json
assert(fs.existsSync("updates.json"), "updates.json must exist");
const updates = JSON.parse(fs.readFileSync("updates.json", "utf-8"));

// Assert 1: manifest_version = 2
assert.strictEqual(manifest.manifest_version, 2, "manifest_version must be 2");

// Assert 2: plugin ID
assert(manifest.applications?.zotero?.id, "manifest must define applications.zotero.id");
assert.strictEqual(
  manifest.applications.zotero.id,
  "paperpilot@zotero.org",
  "plugin ID must be paperpilot@zotero.org"
);

// Assert 3 & 4: update_url exists and is HTTPS
assert(manifest.applications.zotero.update_url, "update_url must exist in manifest");
assert(
  typeof manifest.applications.zotero.update_url === "string",
  "update_url must be a string"
);
assert(
  manifest.applications.zotero.update_url.startsWith("https://"),
  "update_url must use HTTPS protocol"
);
assert(
  manifest.applications.zotero.update_url.includes("updates.json"),
  "update_url must point to updates.json"
);

// Assert 5 & 6: min = 10.0, max = 10.0.*
assert.strictEqual(
  manifest.applications.zotero.strict_min_version,
  "10.0",
  "strict_min_version must be '10.0'"
);
assert.strictEqual(
  manifest.applications.zotero.strict_max_version,
  "10.0.*",
  "strict_max_version must be '10.0.*' for Zotero 10 compatibility"
);

// Assert 7: updates.json addon ID matches
const addonId = manifest.applications.zotero.id;
assert(updates.addons && updates.addons[addonId], `updates.json must contain entry for "${addonId}"`);
const updateList = updates.addons[addonId].updates;
assert(Array.isArray(updateList) && updateList.length > 0, "updates list must be a non-empty array");

// Assert 8: updates.json version = manifest version
const targetUpdate = updateList.find((u) => u.version === manifest.version);
assert(targetUpdate, `updates.json must contain an entry for version ${manifest.version}`);
assert.strictEqual(targetUpdate.version, manifest.version, `version must match manifest.version`);

// Assert 9: update_link file name matches paperpilot-${manifest.version}.xpi
assert(
  targetUpdate.update_link && targetUpdate.update_link.endsWith(`paperpilot-${manifest.version}.xpi`),
  `update_link must point to paperpilot-${manifest.version}.xpi`
);
assert.strictEqual(
  targetUpdate.applications?.zotero?.strict_min_version,
  "10.0",
  "updates.json strict_min_version must be 10.0"
);
assert.strictEqual(
  targetUpdate.applications?.zotero?.strict_max_version,
  "10.0.*",
  "updates.json strict_max_version must be 10.0.*"
);

// Assert 10: manifest raw text does not contain "10.*"
const manifestRaw = fs.readFileSync("manifest.json", "utf-8");
assert(!manifestRaw.includes('"10.*"'), "manifest.json must not use legacy '10.*'");

// Assert 11: root locale/ directory exists and contains standard FTL files
assert(fs.existsSync("locale/en-US/paperpilot-mainWindow.ftl"), "locale/en-US/paperpilot-mainWindow.ftl must exist");
assert(fs.existsSync("locale/zh-CN/paperpilot-mainWindow.ftl"), "locale/zh-CN/paperpilot-mainWindow.ftl must exist");
const enFTL = fs.readFileSync("locale/en-US/paperpilot-mainWindow.ftl", "utf-8");
const zhFTL = fs.readFileSync("locale/zh-CN/paperpilot-mainWindow.ftl", "utf-8");
assert(enFTL.includes("paperpilot-item-pane-header"), "en-US FTL must define paperpilot-item-pane-header");
assert(zhFTL.includes("paperpilot-item-pane-header"), "zh-CN FTL must define paperpilot-item-pane-header");
assert(enFTL.includes("paperpilot-item-pane-sidenav"), "en-US FTL must define paperpilot-item-pane-sidenav");
assert(zhFTL.includes("paperpilot-item-pane-sidenav"), "zh-CN FTL must define paperpilot-item-pane-sidenav");

// Assert 12: legacy addon/locale must not exist
assert(!fs.existsSync("addon/locale"), "addon/locale must not exist (Zotero 10 expects root locale/)");

console.log("✅ All Release Manifest & Install Compatibility assertions PASSED.");
