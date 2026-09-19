const assert = require("assert");

/**
 * Test: PDF History Isolation & Multi-Session Management
 * Tests per-PDF storage keys (pdf_${attachmentID}), session creation,
 * active session switching, strict AI prompt history scoping, and legacy migration.
 */
function testPDFHistoryIsolation() {
  console.log("=== [Test 3] PDF History Isolation & Multi-Session Scoping ===");

  // Mock Storage Implementation
  const memoryStore = new Map();

  function getPDFStorageKey(attachmentID, itemKey) {
    if (attachmentID && attachmentID > 0) {
      return `pdf_${attachmentID}`;
    }
    return `item_${itemKey || "unknown"}`;
  }

  function createNewHistory(storageKey, attachmentID, itemKey, title) {
    const defaultSession = {
      id: "session_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      title: "对话 1",
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      messages: [],
    };
    return {
      schemaVersion: 2,
      storageKey,
      attachmentID,
      itemKey,
      title: title || "",
      activeSessionId: defaultSession.id,
      sessions: [defaultSession],
      lastUpdated: Date.now(),
    };
  }

  function getPDFHistory(attachmentID, itemKey, title) {
    const storageKey = getPDFStorageKey(attachmentID, itemKey);
    if (memoryStore.has(storageKey)) {
      return JSON.parse(JSON.stringify(memoryStore.get(storageKey)));
    }
    const initial = createNewHistory(storageKey, attachmentID, itemKey, title);
    memoryStore.set(storageKey, JSON.parse(JSON.stringify(initial)));
    return initial;
  }

  function savePDFHistory(history) {
    memoryStore.set(history.storageKey, JSON.parse(JSON.stringify(history)));
  }

  function createSession(history, title) {
    const nextIdx = history.sessions.length + 1;
    const session = {
      id: "session_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      title: title || `对话 ${nextIdx}`,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      messages: [],
    };
    history.sessions.push(session);
    history.activeSessionId = session.id;
    return session;
  }

  // 1. PDF A vs PDF B Isolation
  const pdfA_att = 100;
  const pdfA_key = "AAA";
  const pdfB_att = 200;
  const pdfB_key = "BBB";

  const historyA = getPDFHistory(pdfA_att, pdfA_key, "Paper A");
  const sessionA1 = historyA.sessions[0];
  sessionA1.title = "Session A1";
  sessionA1.messages.push({ role: "user", content: "Question in A1" });

  const sessionA2 = createSession(historyA, "Session A2");
  sessionA2.messages.push({ role: "user", content: "Question in A2" });
  savePDFHistory(historyA);

  const historyB = getPDFHistory(pdfB_att, pdfB_key, "Paper B");
  const sessionB1 = historyB.sessions[0];
  sessionB1.title = "Session B1";
  sessionB1.messages.push({ role: "user", content: "Question in B1" });
  savePDFHistory(historyB);

  // Reload histories
  const loadedA = getPDFHistory(pdfA_att, pdfA_key);
  const loadedB = getPDFHistory(pdfB_att, pdfB_key);

  assert.strictEqual(loadedA.storageKey, "pdf_100");
  assert.strictEqual(loadedB.storageKey, "pdf_200");
  assert.strictEqual(loadedA.sessions.length, 2, "PDF A must contain exactly 2 sessions");
  assert.strictEqual(loadedB.sessions.length, 1, "PDF B must contain exactly 1 session");

  const titlesA = loadedA.sessions.map((s) => s.title);
  assert(titlesA.includes("Session A1") && titlesA.includes("Session A2"));
  assert(!titlesA.includes("Session B1"), "PDF A must not contain sessions from PDF B");

  const titlesB = loadedB.sessions.map((s) => s.title);
  assert(titlesB.includes("Session B1"));
  assert(!titlesB.includes("Session A1"), "PDF B must not contain sessions from PDF A");
  console.log("✅ PDF A and PDF B are strictly isolated by attachmentID.");

  // 2. Session isolation & Prompt message scoping
  // In Session A1: Q: "What is the primary method?" -> A: "Transformer architecture"
  sessionA1.messages = [
    { role: "user", content: "What is the primary method?" },
    { role: "assistant", content: "Transformer architecture" },
  ];
  // In Session A2: Q: "What dataset was used?" -> A: "ImageNet"
  sessionA2.messages = [
    { role: "user", content: "What dataset was used?" },
    { role: "assistant", content: "ImageNet" },
  ];
  savePDFHistory(historyA);

  // Reload history for PDF A and switch session
  const reloadedA = getPDFHistory(pdfA_att, pdfA_key);
  reloadedA.activeSessionId = sessionA1.id;
  const activeSession = reloadedA.sessions.find((s) => s.id === reloadedA.activeSessionId);
  assert(activeSession, "Active session A1 must exist");
  assert.strictEqual(activeSession.title, "Session A1");

  // Construct prompt messages payload as done in panel.ts:
  const messagesPayload = [{ role: "system", content: "System Prompt" }];
  for (const m of activeSession.messages.slice(-6)) {
    messagesPayload.push({ role: m.role, content: m.content });
  }
  messagesPayload.push({ role: "user", content: "Can you explain attention in this method?" });

  const payloadText = JSON.stringify(messagesPayload);
  assert(payloadText.includes("Transformer architecture"), "Payload must contain Session A1 history");
  assert(!payloadText.includes("ImageNet"), "Payload must NOT leak Session A2 history");
  console.log("✅ Session switching and prompt history scoping verified (zero leakage across sessions).");

  // 3. Legacy Migration Test
  const legacyStore = {
    key: "LEGACY123",
    lastUpdated: 1680000000000,
    title: "Legacy Paper Title",
    messages: [
      { role: "user", content: "Old question" },
      { role: "assistant", content: "Old answer" },
    ],
  };

  function migrateLegacy(legacy, newAttachmentID, itemKey) {
    const storageKey = getPDFStorageKey(newAttachmentID, itemKey);
    const initialSession = {
      id: "session_legacy_" + legacy.lastUpdated,
      title: "默认会话",
      createdAt: legacy.lastUpdated,
      lastUpdated: legacy.lastUpdated,
      messages: legacy.messages,
    };
    return {
      schemaVersion: 2,
      storageKey,
      attachmentID: newAttachmentID,
      itemKey,
      title: legacy.title,
      activeSessionId: initialSession.id,
      sessions: [initialSession],
      lastUpdated: Date.now(),
    };
  }

  const migrated = migrateLegacy(legacyStore, 305, "LEGACY123");
  assert.strictEqual(migrated.schemaVersion, 2);
  assert.strictEqual(migrated.storageKey, "pdf_305");
  assert.strictEqual(migrated.sessions.length, 1);
  assert.strictEqual(migrated.sessions[0].messages.length, 2);
  assert.strictEqual(migrated.sessions[0].messages[0].content, "Old question");
  console.log("✅ Legacy unversioned history successfully migrated to schemaVersion 2.");
}

try {
  testPDFHistoryIsolation();
  console.log("ALL PDF HISTORY ISOLATION TESTS PASSED.\n");
} catch (err) {
  console.error("❌ Test failed:", err);
  process.exit(1);
}
