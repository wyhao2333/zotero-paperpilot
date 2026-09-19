/**
 * Secret & Key Leakage Prevention Static Scanner
 * Validates that no production or user secrets, tokens, or API keys exist in the codebase.
 */
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "build",
  "dist",
]);

const IGNORED_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".pdf",
  ".xpi",
  ".zip",
]);

const SECRET_RULES = [
  { type: "OpenAI / Generic Secret Key (sk-...)", regex: /\bsk-[a-zA-Z0-9_\-]{20,}\b/ },
  { type: "GitHub Personal Access Token (ghp_...)", regex: /\bghp_[a-zA-Z0-9]{20,}\b/ },
  { type: "GitHub Fine-Grained Token (github_pat_...)", regex: /\bgithub_pat_[a-zA-Z0-9_]{20,}\b/ },
  { type: "AWS Access Key (AKIA...)", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { type: "Private Key Header", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { type: "Hardcoded Bearer Token", regex: /Bearer\s+[a-zA-Z0-9_\-\.]{30,}/ },
  {
    type: "Hardcoded Non-Empty apiKey Property",
    regex: /apiKey:\s*["']([^"'\r\n]+)["']/,
    validator: (match) => {
      const val = match[1].trim();
      // Allow empty string or local mock "ollama"
      if (val === "" || val === "ollama") return false;
      return true;
    },
  },
];

function scanDirectory(dir, fileList = []) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    if (IGNORED_DIRS.has(item)) continue;
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDirectory(fullPath, fileList);
    } else if (stat.isFile()) {
      const ext = path.extname(item).toLowerCase();
      if (!IGNORED_EXTENSIONS.has(ext)) {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

function runSecretScan() {
  console.log("=== [PaperPilot Security & Secret Leakage Scanner] ===");
  const rootDir = path.resolve(__dirname, "..");
  const files = scanDirectory(rootDir);

  let violations = 0;

  for (const filePath of files) {
    const relativePath = path.relative(rootDir, filePath).replace(/\\/g, "/");
    // Skip this verification script itself
    if (relativePath === "test/verify-no-secrets.js") continue;

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      for (const rule of SECRET_RULES) {
        const match = rule.regex.exec(line);
        if (match) {
          if (rule.validator && !rule.validator(match)) {
            continue;
          }
          console.error(
            `❌ SECURITY VIOLATION: [${rule.type}] detected in file: ${relativePath} at line ${lineNum + 1}`
          );
          violations++;
        }
      }
    }
  }

  if (violations > 0) {
    console.error(`\nFAILED: Found ${violations} potential secrets in repository.`);
    process.exit(1);
  }

  console.log("✅ All online provider default keys are empty (only local Ollama placeholder exists).");
  console.log("✅ No API keys, private tokens, or credentials found in repository.");
  console.log("NO SECRETS DETECTED: PASS");
}

runSecretScan();
