import { PreferenceManager } from "./core/preferences";
import { EventBus } from "./core/event-bus";
import { FloatingBarManager } from "./modules/reader/floating-bar";
import { SidebarPanel } from "./modules/sidebar/panel";

export class PaperPilotPlugin {
  public id: string = "paperpilot@zotero.org";
  public rootURI: string = "";
  private initialized: boolean = false;
  private sectionKey: string = "";
  private notifierID: string | null = null;
  private attachedDocs: WeakSet<Document> = new WeakSet();

  async init(data: any): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.rootURI = data?.rootURI || data?.resourceURI?.spec || "";

    PreferenceManager.init();

    // 1. Register PDF Reader Selection Popup Listener (Zotero 7-10 Official API - PRIMARY PATH)
    this.registerSelectionPopupListener();

    // 2. Register ItemPane & Reader Right Sidebar Section
    this.registerSidebarSection();

    // 3. Dynamic Reader Fallback Hook (using _iframeWindow, WeakSet guard, and lifecycle listeners)
    this.initReaderFallbackHooks();
  }

  destroy(data?: any): void {
    dump("[PaperPilot] Destroying PaperPilot...\n");
    EventBus.clear();
    FloatingBarManager.hide();

    if (this.sectionKey && typeof Zotero !== "undefined" && Zotero.ItemPaneManager?.unregisterSection) {
      try {
        Zotero.ItemPaneManager.unregisterSection(this.sectionKey);
      } catch (e) {
        dump(`[PaperPilot] Error unregistering section: ${e}\n`);
      }
    }

    if (this.notifierID && typeof Zotero !== "undefined" && Zotero.Notifier?.unregisterObserver) {
      try {
        Zotero.Notifier.unregisterObserver(this.notifierID);
      } catch (e) {}
      this.notifierID = null;
    }

    this.initialized = false;
  }

  reloadPreferences(): void {
    PreferenceManager.init();
    dump("[PaperPilot] PreferenceManager reloaded in live instance.\n");
  }

  private registerSelectionPopupListener(): void {
    if (typeof Zotero === "undefined" || !Zotero.Reader) return;

    try {
      if (typeof Zotero.Reader.registerEventListener === "function") {
        Zotero.Reader.registerEventListener(
          "renderTextSelectionPopup",
          (event: any) => {
            FloatingBarManager.handleNativeSelectionPopup(event);
            // Also opportunistically ensure fallback is attached
            this.scanAndHookReaders();
          },
          this.id
        );
        dump("[PaperPilot] Reader selection listener registered\n");
      }
    } catch (e) {
      dump(`[PaperPilot] Failed to register renderTextSelectionPopup: ${e}\n`);
    }
  }

  private registerSidebarSection(): void {
    if (typeof Zotero === "undefined" || !Zotero.ItemPaneManager?.registerSection) return;

    try {
      this.sectionKey = Zotero.ItemPaneManager.registerSection({
        paneID: "paperpilot-section",
        pluginID: this.id,
        header: {
          label: "PaperPilot 伴读",
          icon: `${this.rootURI}addon/icon.svg`,
        },
        sidenav: {
          label: "PaperPilot",
          icon: `${this.rootURI}addon/icon.svg`,
        },
        bodyXHTML: '<div id="paperpilot-sidebar-mount" style="min-height:420px; height:100%; display:flex; flex-direction:column;"></div>',
        onRender: ({ body, item }: any) => {
          const mount = body.querySelector("#paperpilot-sidebar-mount") || body;
          let panel: SidebarPanel = (body as any)._paperPilotPanel;
          if (!panel) {
            panel = new SidebarPanel(mount);
            (body as any)._paperPilotPanel = panel;
          }
          if (item) {
            const regular = item.isRegularItem() ? item : item.parentItem || item;
            panel.loadPaper(regular.key, regular.getField ? regular.getField("title") : "文献", regular.id);
          }
        },
      });
      dump(`[PaperPilot] Successfully registered sidebar section with key: ${this.sectionKey}\n`);
    } catch (e) {
      dump(`[PaperPilot] Failed to register ItemPane section: ${e}\n`);
    }
  }

  private initReaderFallbackHooks(): void {
    if (typeof Zotero === "undefined" || !Zotero.Reader) return;

    // Scan initially for any readers open prior to plugin initialization
    this.scanAndHookReaders();

    // Hook reader toolbar render event (fires whenever any reader tab/window opens or is rendered)
    try {
      if (typeof Zotero.Reader.registerEventListener === "function") {
        Zotero.Reader.registerEventListener(
          "renderToolbar",
          () => {
            this.scanAndHookReaders();
          },
          this.id
        );
      }
    } catch (e) {}

    // Hook Zotero Notifier for tab changes
    try {
      if (Zotero.Notifier && typeof Zotero.Notifier.registerObserver === "function") {
        this.notifierID = Zotero.Notifier.registerObserver(
          {
            notify: (action: string, type: string) => {
              if (type === "tab") {
                this.scanAndHookReaders();
              }
            },
          },
          ["tab"],
          "PaperPilot"
        );
      }
    } catch (e) {}
  }

  private scanAndHookReaders(): void {
    if (typeof Zotero === "undefined" || !Zotero.Reader) return;

    const readers = Zotero.Reader._readers;
    if (!Array.isArray(readers)) return;

    for (const reader of readers) {
      try {
        const win = reader._iframeWindow || reader._window || reader?._internalReader?._window;
        const doc = win?.document || reader._iframeWindow?.document || reader?._window?.document;

        if (doc && win && !this.attachedDocs.has(doc)) {
          this.attachedDocs.add(doc);
          FloatingBarManager.attachToReaderDocument(doc, win);
          dump("[PaperPilot] fallback reader attached\n");
        }
      } catch (e) {}
    }
  }
}

export const PaperPilot = new PaperPilotPlugin();

// Expose globally to all scopes
if (typeof Zotero !== "undefined") {
  (Zotero as any).PaperPilot = PaperPilot;
}
if (typeof globalThis !== "undefined") {
  (globalThis as any).PaperPilot = PaperPilot;
  if ((globalThis as any).Zotero) {
    (globalThis as any).Zotero.PaperPilot = PaperPilot;
  }
}
if (typeof window !== "undefined") {
  (window as any).PaperPilot = PaperPilot;
}

export default PaperPilot;
