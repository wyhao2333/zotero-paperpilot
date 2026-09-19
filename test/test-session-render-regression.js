const assert = require("assert");
const esbuild = require("esbuild");

global.dump = global.dump || (() => {});

console.log("=== [Test] Session Render & Recovery Regression ===");

// 1. Compile chat-view and markdown-math
const buildResult = esbuild.buildSync({
  entryPoints: ["src/modules/sidebar/chat-view.ts"],
  bundle: true,
  format: "cjs",
  write: false,
  platform: "node",
});

// Mock DOM elements and document for ChatView
class MockNode {
  constructor(nodeType, tagName = "", ns = "") {
    this.nodeType = nodeType;
    this.tagName = tagName;
    this.namespaceURI = ns;
    this.attributes = [];
    this.childNodes = [];
    this._textContent = "";
    this.style = {};
    this.classList = {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); },
    };
  }

  get textContent() {
    if (this.childNodes.length > 0) {
      return this.childNodes.map((c) => c.textContent).join("");
    }
    return this._textContent;
  }

  set textContent(v) {
    this.childNodes = [];
    this._textContent = String(v);
  }

  setAttribute(k, v) {
    this.attributes.push({ name: k, value: String(v) });
  }

  getAttribute(k) {
    const attr = this.attributes.find((a) => a.name === k);
    return attr ? attr.value : null;
  }

  appendChild(child) {
    if (child.nodeType === 11) { // DocumentFragment
      const children = [...child.childNodes];
      child.childNodes = [];
      for (const c of children) {
        this.appendChild(c);
      }
      return child;
    }
    this.childNodes.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
    }
    return child;
  }

  get firstChild() {
    return this.childNodes[0] || null;
  }

  querySelector(sel) {
    for (const c of this.childNodes) {
      if (sel.startsWith(".") && c.classList && c.classList.contains(sel.slice(1))) {
        return c;
      }
      if (sel.startsWith("#") && c.getAttribute("id") === sel.slice(1)) {
        return c;
      }
      const found = c.querySelector?.(sel);
      if (found) return found;
    }
    return null;
  }

  closest(sel) {
    return null;
  }
}

class MockDocument {
  constructor() {
    this.defaultView = {
      DOMParser: class MockDOMParser {
        parseFromString(htmlStr, mimeType) {
          const doc = new MockDocument();
          if (mimeType === "application/xml") {
            const root = new MockNode(1, "html:div", "http://www.w3.org/1999/xhtml");
            const msgEl = new MockNode(1, "html:div", "http://www.w3.org/1999/xhtml");
            msgEl.classList.add("paperpilot-msg");
            const contentEl = new MockNode(1, "html:div", "http://www.w3.org/1999/xhtml");
            contentEl.classList.add("msg-content");
            msgEl.appendChild(contentEl);
            root.appendChild(msgEl);
            doc.documentElement = root;
            return doc;
          } else {
            const wrapper = new MockNode(1, "div");
            wrapper.setAttribute("id", "wrapper");
            wrapper.textContent = htmlStr;
            doc.elementsById["wrapper"] = wrapper;
            return doc;
          }
        }
      },
    };
    this.elementsById = {};
    this.documentElement = null;
  }

  createElementNS(ns, tagName) {
    return new MockNode(1, tagName, ns);
  }

  createElement(tagName) {
    return new MockNode(1, tagName, "http://www.w3.org/1999/xhtml");
  }

  createTextNode(text) {
    const node = new MockNode(3);
    node.textContent = text;
    return node;
  }

  createDocumentFragment() {
    return new MockNode(11);
  }

  getElementById(id) {
    return this.elementsById[id] || null;
  }
}

// Instantiate test environment
const mockDoc = new MockDocument();
const container = new MockNode(1, "div");
container.ownerDocument = mockDoc;

// Load compiled ChatView
const moduleObj = { exports: {} };
const runner = new Function("module", "exports", "require", buildResult.outputFiles[0].text);
runner(moduleObj, moduleObj.exports, require);
const { ChatView } = moduleObj.exports;

assert(ChatView, "ChatView must be exported");

const chatView = new ChatView(container);

// Test 1: Historical poisoned message interception
console.log("-> Test 1: Poisoned 'Node is not defined' message interception");
const poisonedMsg = {
  id: "msg_poisoned",
  role: "assistant",
  content: "❌ 出错: ReferenceError: Node is not defined",
  timestamp: Date.now(),
};

chatView.appendMessage(poisonedMsg);
const renderedContent = container.querySelector(".msg-content");
assert(renderedContent, "Rendered msg-content must exist");
assert(
  !renderedContent.textContent.includes("ReferenceError: Node is not defined"),
  "Poisoned message error must NOT be shown directly to the user"
);
assert(
  renderedContent.textContent.includes("早期版本的渲染异常提示"),
  "Friendly recovery notice must be shown to the user"
);
console.log("  PASS: Poisoned historical error is sanitized with recovery guidance.");

// Test 2: AI answer persistence vs rendering separation
console.log("-> Test 2: AI response content persistence integrity");
const fullAIAnswer = "根据公式 $E=mc^2$ 推导，质能守恒定理在所有惯性系下均成立。";
const validMsg = {
  id: "msg_valid_1",
  role: "assistant",
  content: fullAIAnswer,
  timestamp: Date.now(),
};

chatView.appendMessage(validMsg);
const validMsgContent = container.childNodes[container.childNodes.length - 1].querySelector(".msg-content");
assert(validMsgContent, "Valid message container must exist");
assert.strictEqual(validMsg.content, fullAIAnswer, "Underlying message object content must remain intact");
console.log("  PASS: AI response content remains untouched and verified.");

// Test 3: Session switch clears and re-renders through unified pipeline
console.log("-> Test 3: Session switch re-render through unified pipeline");
const sessionMessages = [
  { id: "u_1", role: "user", content: "请问什么是卡尔曼滤波？", timestamp: 1 },
  { id: "a_1", role: "assistant", content: "卡尔曼滤波是一种最优估计方法，$x_k = A x_{k-1} + B u_k$。", timestamp: 2 },
];

chatView.render(sessionMessages);
assert.strictEqual(container.childNodes.length, 2, "Session switch must re-render all messages");
console.log("  PASS: Session switch re-render succeeded without throwing Node errors.");

console.log("=== All Session Render & Recovery Regression tests passed successfully ===");
