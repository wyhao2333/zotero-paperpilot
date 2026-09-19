const assert = require("assert");
const fs = require("fs");
const esbuild = require("esbuild");

console.log("=== [Test] Note Renderer Production & Schema Isolation ===");

// 1. Compile NoteExporter and MarkdownMathRenderer
const buildResult = esbuild.buildSync({
  entryPoints: ["src/modules/sidebar/note-exporter.ts"],
  bundle: true,
  format: "cjs",
  write: false,
  platform: "node",
});

const moduleObj = { exports: {} };
const runner = new Function("module", "exports", "require", buildResult.outputFiles[0].text);
runner(moduleObj, moduleObj.exports, require);
const { NoteExporter } = moduleObj.exports;

assert(NoteExporter, "NoteExporter must be exported");

// Test 1: Verify note-exporter.ts calls renderForZoteroNoteBody, not nested schema
console.log("-> Test 1: NoteExporter source code schema inspection");
const noteSource = fs.readFileSync("src/modules/sidebar/note-exporter.ts", "utf-8");
assert(
  noteSource.includes("renderForZoteroNoteBody"),
  "note-exporter.ts must call renderForZoteroNoteBody"
);
assert(
  !noteSource.includes("renderForZoteroNote("),
  "note-exporter.ts must NOT call renderForZoteroNote inside loop (which creates nested schemas)"
);
console.log("  PASS: NoteExporter uses body-only renderer to avoid schema nesting.");

// Test 2: Mock Zotero.Item and export messages containing math
console.log("-> Test 2: Full note HTML structure & single-schema constraint");
let createdNoteHtml = "";

global.dump = global.dump || (() => {});
global.Zotero = {
  Item: class MockItem {
    constructor() {
      this.note = "";
    }
    setNote(html) {
      this.note = html;
      createdNoteHtml = html;
    }
    setField() {}
    saveTx() {
      return Promise.resolve(true);
    }
  },
};

const sampleMessages = [
  {
    id: "u1",
    role: "user",
    content: "请解释公式 $E=mc^2$ 的物理意义。",
    timestamp: 1000,
    selectedQuote: "Energy-mass equivalence",
  },
  {
    id: "a1",
    role: "assistant",
    content: "质能方程指出质量与能量在相对论体系下可相互转化：\n$$\\Delta E = \\Delta m \\cdot c^2$$\n其中 $c$ 为真空中的光速。",
    timestamp: 2000,
  },
];

NoteExporter.exportToZoteroNote(12345, "测试文献", sampleMessages).then((success) => {
  assert(success === true, "exportToZoteroNote must return true on success");
  assert(createdNoteHtml.length > 0, "Generated note HTML must not be empty");

  // Verify single schema root
  const schemaRegex = /data-schema-version="9"/g;
  const matches = createdNoteHtml.match(schemaRegex);
  assert(matches !== null, "Note must contain data-schema-version=\"9\"");
  assert.strictEqual(
    matches.length,
    1,
    `Note must contain EXACTLY ONE data-schema-version="9", but found ${matches.length} (nested schemas cause Zotero Note corruption)`
  );

  // Root element check
  assert(createdNoteHtml.startsWith('<div data-schema-version="9">'), "Root element must start with <div data-schema-version=\"9\">");
  assert(createdNoteHtml.endsWith("</div>"), "Root element must end with </div>");

  // Math elements check
  assert(createdNoteHtml.includes('<span class="math">$E=mc^2$</span>'), "Inline math in user query must be formatted as <span class=\"math\">$E=mc^2$</span>");
  assert(createdNoteHtml.includes('<pre class="math">$$\\Delta E = \\Delta m \\cdot c^2$$</pre>'), "Block math in assistant response must be formatted as <pre class=\"math\">$$...$$</pre>");
  assert(createdNoteHtml.includes('<span class="math">$c$</span>'), "Inline math $c$ must be formatted as <span class=\"math\">$c$</span>");

  console.log("  PASS: Single outer schema root confirmed and math formatting valid.");
  console.log("=== All Note Renderer Production tests passed successfully ===");
}).catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
