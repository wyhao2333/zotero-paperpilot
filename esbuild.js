const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const isPackage = process.argv.includes("--package");

function addDirectoryToZip(zip, folderPath, zipFolder) {
  if (!fs.existsSync(folderPath)) return;
  const items = fs.readdirSync(folderPath);
  for (const item of items) {
    const fullPath = path.join(folderPath, item);
    if (fs.statSync(fullPath).isDirectory()) {
      const subZip = zipFolder.folder(item);
      addDirectoryToZip(zip, fullPath, subZip);
    } else {
      zipFolder.file(item, fs.readFileSync(fullPath));
    }
  }
}

async function build() {
  console.log("[PaperPilot] Building IIFE bundle with esbuild for Zotero 10...");

  // Ensure output directories exist
  if (!fs.existsSync("addon")) fs.mkdirSync("addon", { recursive: true });
  if (!fs.existsSync("chrome/content/scripts")) fs.mkdirSync("chrome/content/scripts", { recursive: true });
  if (!fs.existsSync("build")) fs.mkdirSync("build", { recursive: true });

  await esbuild.build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    format: "iife",
    globalName: "PaperPilotBundle",
    target: "firefox115",
    outfile: "chrome/content/scripts/index.js",
    sourcemap: false,
    external: ["ChromeUtils", "Services", "Zotero"],
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  });

  // Also copy to addon/index.js for dual fallback
  fs.copyFileSync("chrome/content/scripts/index.js", "addon/index.js");

  console.log("[PaperPilot] IIFE bundle generated -> chrome/content/scripts/index.js & addon/index.js");

  if (isPackage) {
    console.log("[PaperPilot] Packaging .xpi bundle for Zotero 10...");
    const zip = new JSZip();

    // 1. Root files
    zip.file("manifest.json", fs.readFileSync("manifest.json"));
    zip.file("bootstrap.js", fs.readFileSync("bootstrap.js"));

    // 2. Add addon folder
    const addonFolder = zip.folder("addon");
    addDirectoryToZip(zip, "addon", addonFolder);

    // 3. Add chrome folder (preferences.xhtml, preferences.js, scripts/index.js)
    if (fs.existsSync("chrome")) {
      const chromeFolder = zip.folder("chrome");
      addDirectoryToZip(zip, "chrome", chromeFolder);
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
