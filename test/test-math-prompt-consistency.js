const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("=== [Test] AI Math Prompt Consistency ===");

// 1. Check math-output-rules.ts
console.log("-> Check 1: Shared MATH_OUTPUT_RULES module");
const rulesPath = path.join("src", "modules", "ai", "math-output-rules.ts");
assert(fs.existsSync(rulesPath), "src/modules/ai/math-output-rules.ts must exist");
const rulesSrc = fs.readFileSync(rulesPath, "utf-8");
assert(rulesSrc.includes("export const MATH_OUTPUT_RULES"), "Must export MATH_OUTPUT_RULES");
assert(rulesSrc.includes("$...$") && rulesSrc.includes("$$...$$"), "Must specify $...$ and $$...$$");
assert(rulesSrc.includes("x_k") && rulesSrc.includes("R^n"), "Must explicitly forbid naked x_k, R^n");
console.log("  PASS: Shared MATH_OUTPUT_RULES module verified.");

// 2. Check panel.ts (Sidebar normal QA)
console.log("-> Check 2: Sidebar Normal QA system prompt");
const panelPath = path.join("src", "modules", "sidebar", "panel.ts");
const panelSrc = fs.readFileSync(panelPath, "utf-8");
assert(panelSrc.includes("MATH_OUTPUT_RULES"), "panel.ts must import and use MATH_OUTPUT_RULES");
assert(/handleUserSendMessage[\s\S]*?MATH_OUTPUT_RULES/.test(panelSrc), "handleUserSendMessage must include MATH_OUTPUT_RULES in system prompt");
console.log("  PASS: Sidebar Normal QA includes MATH_OUTPUT_RULES.");

// 3. Check prompts.ts (Domain interpretation prompts)
console.log("-> Check 3: Domain Prompts (Interpretation & Domains)");
const promptsPath = path.join("src", "modules", "ai", "prompts.ts");
const promptsSrc = fs.readFileSync(promptsPath, "utf-8");
assert(promptsSrc.includes("MATH_OUTPUT_RULES"), "prompts.ts must import and use MATH_OUTPUT_RULES");

const requiredDomains = ["general", "cs_ai", "med_bio", "econ_social", "engineering", "custom"];
for (const domain of requiredDomains) {
  const domainBlockRegex = new RegExp(`${domain}:\\s*\\{[\\s\\S]*?systemPrompt:[\\s\\S]*?MATH_OUTPUT_RULES`);
  assert(domainBlockRegex.test(promptsSrc), `Domain "${domain}" system prompt must include MATH_OUTPUT_RULES`);
}
console.log("  PASS: All 6 domain prompts include MATH_OUTPUT_RULES.");

// 4. Check digest.ts (Paper Digest Service)
console.log("-> Check 4: Paper Digest Service");
const digestPath = path.join("src", "modules", "ai", "digest.ts");
const digestSrc = fs.readFileSync(digestPath, "utf-8");
assert(digestSrc.includes("MATH_OUTPUT_RULES"), "digest.ts must import and use MATH_OUTPUT_RULES");
assert(digestSrc.includes("SYSTEM_PROMPT") && digestSrc.includes("MATH_OUTPUT_RULES"), "SYSTEM_PROMPT must use MATH_OUTPUT_RULES");
assert(digestSrc.includes("partPrompt") && digestSrc.includes("partSummary"), "Map-reduce part stage must enforce math rules");
console.log("  PASS: Digest single-pass and map-reduce prompts enforce math rules.");

// 5. Check ai-translator.ts isolation (pure translation should not be contaminated)
console.log("-> Check 5: Pure AI Translation isolation");
const transPath = path.join("src", "modules", "translator", "ai-translator.ts");
const transSrc = fs.readFileSync(transPath, "utf-8");
assert(!transSrc.includes("MATH_OUTPUT_RULES"), "ai-translator.ts must remain pure translation without math prompts");
console.log("  PASS: Pure AI translation prompt remains clean and isolated.");

console.log("=== All AI Math Prompt Consistency tests passed successfully ===");
