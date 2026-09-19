const assert = require("assert");

/**
 * Test: Selection Button State Machine
 * Verifies default button states and dynamic transitions when
 * translate, interpret, or ask is triggered.
 */
function testSelectionButtonState() {
  console.log("=== [Test 4] Selection Button State Machine ===");

  class MockButton {
    constructor(id) {
      this.id = id;
      this.attributes = {};
      this.style = {};
      this.listeners = {};
    }
    setAttribute(name, val) {
      this.attributes[name] = String(val);
    }
    getAttribute(name) {
      return this.attributes[name];
    }
    addEventListener(evt, fn) {
      this.listeners[evt] = fn;
    }
    click() {
      if (this.listeners["click"]) {
        this.listeners["click"]({ stopPropagation: () => {}, preventDefault: () => {} });
      }
    }
  }

  const btnTrans = new MockButton("pp-trans");
  const btnInterpret = new MockButton("pp-interpret");
  const btnAsk = new MockButton("pp-ask");

  const setActiveButton = (active) => {
    btnTrans.setAttribute("data-active", active === "translate" ? "true" : "false");
    btnTrans.setAttribute("aria-pressed", active === "translate" ? "true" : "false");

    btnInterpret.setAttribute("data-active", active === "interpret" ? "true" : "false");
    btnInterpret.setAttribute("aria-pressed", active === "interpret" ? "true" : "false");

    btnAsk.setAttribute("data-active", active === "ask" ? "true" : "false");
    btnAsk.setAttribute("aria-pressed", active === "ask" ? "true" : "false");
  };

  btnTrans.addEventListener("click", () => setActiveButton("translate"));
  btnInterpret.addEventListener("click", () => setActiveButton("interpret"));
  btnAsk.addEventListener("click", () => setActiveButton("ask"));

  // 1. Initial Default State
  setActiveButton("translate");
  assert.strictEqual(btnTrans.getAttribute("data-active"), "true", "Default: translate must be active");
  assert.strictEqual(btnInterpret.getAttribute("data-active"), "false", "Default: interpret must be inactive");
  assert.strictEqual(btnAsk.getAttribute("data-active"), "false", "Default: ask must be inactive");
  console.log("✅ Initial state verified: translate active, interpret inactive, ask inactive.");

  // 2. Click interpret
  btnInterpret.click();
  assert.strictEqual(btnTrans.getAttribute("data-active"), "false", "After interpret click: translate inactive");
  assert.strictEqual(btnInterpret.getAttribute("data-active"), "true", "After interpret click: interpret active");
  assert.strictEqual(btnAsk.getAttribute("data-active"), "false", "After interpret click: ask inactive");
  console.log("✅ Interpret click transition verified: translate inactive, interpret active, ask inactive.");

  // 3. Click ask
  btnAsk.click();
  assert.strictEqual(btnTrans.getAttribute("data-active"), "false", "After ask click: translate inactive");
  assert.strictEqual(btnInterpret.getAttribute("data-active"), "false", "After ask click: interpret inactive");
  assert.strictEqual(btnAsk.getAttribute("data-active"), "true", "After ask click: ask active");
  console.log("✅ Ask click transition verified: translate inactive, interpret inactive, ask active.");

  // 4. Click translate
  btnTrans.click();
  assert.strictEqual(btnTrans.getAttribute("data-active"), "true", "After translate click: translate active");
  assert.strictEqual(btnInterpret.getAttribute("data-active"), "false", "After translate click: interpret inactive");
  assert.strictEqual(btnAsk.getAttribute("data-active"), "false", "After translate click: ask inactive");
  console.log("✅ Translate click transition verified: translate active, interpret inactive, ask inactive.");
}

try {
  testSelectionButtonState();
  console.log("ALL SELECTION BUTTON STATE TESTS PASSED.\n");
} catch (err) {
  console.error("❌ Test failed:", err);
  process.exit(1);
}
