const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const isWatch = process.argv.includes("--watch");
const isPackage = process.argv.includes("--package") || true;

async function build() {
  console.log("[PaperPilot] Building TypeScript bundle with esbuild...");

  // Ensure addon and build directories exist
  if (!fs.existsSync("addon")) {
    fs.mkdirSync("addon", { recursive: true });
  }
  if (!fs.existsSync("build")) {
    fs.mkdirSync("build", { recursive: true });
  }

  await esbuild.build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    format: "esm",
    target: "firefox115",
    outfile: "addon/index.js",
    sourcemap: "inline",
    external: ["ChromeUtils"],
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  });

  console.log("[PaperPilot] TypeScript compilation successful -> addon/index.js");

  if (isPackage) {
    console.log("[PaperPilot] Packaging .xpi bundle for Zotero 7-10...");
    const zip = new JSZip();

    // Add manifest.json and bootstrap.js
    zip.file("manifest.json", fs.readFileSync("manifest.json"));
    zip.file("bootstrap.js", fs.readFileSync("bootstrap.js"));

    // Add addon directory files
    const addonFiles = fs.readdirSync("addon");
    const addonFolder = zip.folder("addon");
    for (const file of addonFiles) {
      const filePath = path.join("addon", file);
      if (fs.statSync(filePath).isFile()) {
        addonFolder.file(file, fs.readFileSync(filePath));
      }
    }

    const content = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    });

    const xpiPath = path.join("build", "zotero-paperpilot.xpi");
    fs.writeFileSync(xpiPath, content);
    console.log(`[PaperPilot] Successfully created XPI package: ${xpiPath} (${(content.length / 1024).toFixed(1)} KB)`);
  }
}

build().catch((err) => {
  console.error("[PaperPilot] Build failed:", err);
  process.exit(1);
});
