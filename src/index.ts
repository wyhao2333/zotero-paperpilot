import { PreferenceManager } from "./core/preferences";
import { EventBus } from "./core/event-bus";
import { FloatingBarManager } from "./modules/reader/floating-bar";
import { SidebarPanel } from "./modules/sidebar/panel";

export class PaperPilotPlugin {
  private id: string = "paperpilot@zotero.org";
  private rootURI: string = "";
  private initialized: boolean = false;
  private readerHooks: Map<string, any> = new Map();

  init(data: any): void {
    if (this.initialized) return;
    this.initialized = true;
    this.rootURI = data?.rootURI || data?.resourceURI?.spec || "";

    dump("[PaperPilot] Initializing PaperPilot for Zotero 7-10...\n");
    PreferenceManager.init();

    this.registerReaderListener();
  }

  destroy(data?: any): void {
    dump("[PaperPilot] Destroying PaperPilot...\n");
    EventBus.clear();
    FloatingBarManager.hide();
    this.readerHooks.clear();
    this.initialized = false;
  }

  private registerReaderListener(): void {
    if (typeof Zotero === "undefined" || !Zotero.Reader) return;

    // Listen for tab switching in Zotero Reader
    if (typeof Zotero.Reader.onChangeTab === "function") {
      Zotero.Reader.onChangeTab((reader: any) => {
        if (reader) {
          this.hookReader(reader);
        }
      });
    }

    // Hook currently active readers if any
    try {
      const readers = Zotero.Reader._readers || [];
      for (const r of readers) {
        this.hookReader(r);
      }
    } catch (e) {
      dump(`[PaperPilot] Hook existing readers error: ${e}\n`);
    }
  }

  private hookReader(reader: any): void {
    if (!reader || !reader.tabID || this.readerHooks.has(reader.tabID)) return;
    this.readerHooks.set(reader.tabID, true);

    const checkReady = () => {
      // Access reader internal window & DOM
      const readerWin = reader._iframeWindow || reader.window;
      const readerDoc = readerWin?.document;

      if (!readerDoc || !readerDoc.body) {
        setTimeout(checkReady, 200);
        return;
      }

      // 1. Inject Stylesheet into Reader Window
      this.injectStyle(readerDoc);

      // 2. Attach Floating Selection Toolbar
      FloatingBarManager.attachToReaderWindow(readerWin, readerDoc);

      // 3. Mount Sidebar Panel into reader's right sidebar
      this.mountSidebar(reader, readerDoc);
    };

    checkReady();
  }

  private injectStyle(doc: Document): void {
    if (doc.getElementById("paperpilot-style")) return;
    const link = doc.createElement("link");
    link.id = "paperpilot-style";
    link.rel = "stylesheet";
    link.href = `${this.rootURI}addon/style.css`;
    doc.head?.appendChild(link);
  }

  private mountSidebar(reader: any, doc: Document): void {
    // Check if sidebar container already exists
    if (doc.getElementById("paperpilot-sidebar-root")) return;

    // Look for Zotero's right sidebar container or create a collapsible dock
    const rightSidebar = doc.querySelector("#sidebar-container") || doc.querySelector(".sidebar") || doc.body;

    const sidebarRoot = doc.createElement("div");
    sidebarRoot.id = "paperpilot-sidebar-root";
    sidebarRoot.style.cssText = `
      position: absolute;
      top: 0;
      right: 0;
      width: 340px;
      height: 100%;
      z-index: 1000;
      box-shadow: -2px 0 8px rgba(0,0,0,0.08);
      border-left: 1px solid var(--pp-border, #e2e8f0);
      background: var(--pp-bg, #ffffff);
      display: flex;
      flex-direction: column;
    `;

    rightSidebar.appendChild(sidebarRoot);
    const panel = new SidebarPanel(sidebarRoot);

    // Fetch Paper Metadata & Item key
    try {
      if (typeof Zotero !== "undefined" && reader.itemID) {
        const item = Zotero.Items.get(reader.itemID);
        if (item) {
          const regularItem = item.isRegularItem() ? item : item.parentItem || item;
          const title = regularItem.getField("title") || "文献阅读";
          panel.loadPaper(regularItem.key, title, regularItem.id);
        }
      }
    } catch (e) {
      dump(`[PaperPilot] Load paper metadata error: ${e}\n`);
    }
  }
}

export const PaperPilot = new PaperPilotPlugin();
