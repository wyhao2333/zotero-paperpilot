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
assert.strictEqual(targetUpdate.version, "1.0.1", "version must be 1.0.1");

// Assert 9: update_link file name matches paperpilot-1.0.1.xpi
assert(
  targetUpdate.update_link && targetUpdate.update_link.endsWith("paperpilot-1.0.1.xpi"),
  "update_link must point to paperpilot-1.0.1.xpi"
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

console.log("✅ All Release Manifest & Install Compatibility assertions PASSED.");
