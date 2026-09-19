import { PreferenceManager } from "./core/preferences";
import { EventBus } from "./core/event-bus";
import { FloatingBarManager } from "./modules/reader/floating-bar";
import { SidebarPanel } from "./modules/sidebar/panel";
import { PaperPilotSidebarController } from "./modules/sidebar/controller";
import { PromptManager } from "./modules/ai/prompts";
import { DomainType } from "./types/zotero";

export class PaperPilotPlugin {
  public id: string = "paperpilot@zotero.org";
  public rootURI: string = "";
  private initialized: boolean = false;
  private sectionKey: string = "";
  private notifierID: string | null = null;
  private attachedDocs: WeakSet<Document> = new WeakSet();
  private windowStyles: WeakMap<any, ProcessingInstruction> = new WeakMap();

  async init(data: any): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.rootURI = data?.rootURI || data?.resourceURI?.spec || "";

    PreferenceManager.init();
    PreferenceManager.registerObserver();

    // Ensure Fluent localization and stylesheets are inserted in main windows
    try {
      const mainWindows =
        typeof Zotero !== "undefined" && Zotero.getMainWindows
          ? Zotero.getMainWindows()
          : typeof Zotero !== "undefined" && Zotero.getMainWindow
          ? [Zotero.getMainWindow()].filter(Boolean)
          : [];

      for (const win of mainWindows) {
        win?.MozXULElement?.insertFTLIfNeeded?.("paperpilot-mainWindow.ftl");
        this.onMainWindowLoad(win);
      }
    } catch (e) {
      dump(`[PaperPilot] Notice in init window loading: ${e}\n`);
    }

    // 1. Register PDF Reader Selection Popup Listener (Zotero 10 Official API - PRIMARY PATH)
    this.registerSelectionPopupListener();

    // 2. Register ItemPane & Reader Right Sidebar Section
    this.registerSidebarSection();

    // 3. Dynamic Reader Fallback Hook
    this.initReaderFallbackHooks();
  }

  destroy(data?: any): void {
    dump("[PaperPilot] Destroying PaperPilot...\n");
    PreferenceManager.unregisterObserver();
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

    // Remove stylesheets from main windows
    try {
      const mainWindows =
        typeof Zotero !== "undefined" && Zotero.getMainWindows
          ? Zotero.getMainWindows()
          : typeof Zotero !== "undefined" && Zotero.getMainWindow
          ? [Zotero.getMainWindow()].filter(Boolean)
          : [];
      for (const win of mainWindows) {
        this.onMainWindowUnload(win);
      }
    } catch (e) {}

    this.initialized = false;
  }

  /**
   * Main window stylesheet lifecycle: inject addon/style.css into Zotero main window.
   */
  onMainWindowLoad(win: any): void {
    if (!win || !win.document) return;
    if (this.windowStyles.has(win)) return;

    try {
      const doc = win.document;
      const href = `${this.rootURI}addon/style.css`;
      const pi = doc.createProcessingInstruction("xml-stylesheet", `href="${href}" type="text/css"`);
      doc.insertBefore(pi, doc.documentElement);
      this.windowStyles.set(win, pi);
      dump(`[PaperPilot] Main window stylesheet loaded: ${href}\n`);
    } catch (e) {
      dump(`[PaperPilot] Error injecting stylesheet into main window: ${e}\n`);
    }
  }

  onMainWindowUnload(win: any): void {
    if (!win || !win.document) return;
    const pi = this.windowStyles.get(win);
    if (pi) {
      try {
        pi.remove();
      } catch (e) {}
      this.windowStyles.delete(win);
      dump("[PaperPilot] Main window stylesheet removed\n");
    }
  }

  reloadPreferences(): void {
    PreferenceManager.init();
    dump("[PaperPilot] PreferenceManager reloaded in live instance.\n");
  }

  getInterpretationPromptTemplate(domain: DomainType): string {
    return PromptManager.getEffectiveUserPromptTemplate(domain);
  }

  getDefaultInterpretationPromptTemplate(domain: DomainType): string {
    return PromptManager.getDefaultUserPromptTemplate(domain);
  }

  onPrefsLoad(win: any): void {
    dump("[PaperPilot] onPrefsLoad triggered from preference pane\n");
    const prefObj =
      (win && win.PaperPilot_Preferences) ||
      (typeof window !== "undefined" && (window as any).PaperPilot_Preferences) ||
      (typeof globalThis !== "undefined" && (globalThis as any).PaperPilot_Preferences) ||
      (typeof Zotero !== "undefined" && (Zotero as any).PaperPilot?.Preferences);

    if (prefObj && typeof prefObj.init === "function") {
      prefObj.init(win);
    } else {
      dump("[PaperPilot] Notice: PaperPilot_Preferences not yet ready in onPrefsLoad\n");
    }
  }

  private registerSelectionPopupListener(): void {
    if (typeof Zotero === "undefined" || !Zotero.Reader) return;

    try {
      if (typeof Zotero.Reader.registerEventListener === "function") {
        Zotero.Reader.registerEventListener(
          "renderTextSelectionPopup",
          (event: any) => {
            FloatingBarManager.handleNativeSelectionPopup(event);
            this.scanAndHookReaders();
          },
          this.id
        );
        dump("[PaperPilot] selection listener registered\n");
      }
    } catch (e) {
      dump(`[PaperPilot] Failed to register renderTextSelectionPopup: ${e}\n`);
    }
  }

  private registerSidebarSection(): void {
    if (typeof Zotero === "undefined" || !Zotero.ItemPaneManager?.registerSection) return;

    try {
      const key = Zotero.ItemPaneManager.registerSection({
        paneID: "paperpilot-section",
        pluginID: this.id,
        header: {
          l10nID: "paperpilot-item-pane-header",
          icon: `${this.rootURI}addon/icon.svg`,
        },
        sidenav: {
          l10nID: "paperpilot-item-pane-sidenav",
          icon: `${this.rootURI}addon/icon.svg`,
          orderable: false,
        },
        bodyXHTML:
          `<html:style xmlns:html="http://www.w3.org/1999/xhtml">@import url("${this.rootURI}addon/style.css");</html:style>` +
          '<html:div xmlns:html="http://www.w3.org/1999/xhtml" id="paperpilot-sidebar-mount" style="min-height:420px; height:100%; display:flex; flex-direction:column;"></html:div>',
        onItemChange: ({ tabType, item, setEnabled }: any) => {
          setEnabled(tabType === "reader");
          return true;
        },
        onRender: ({ body, item }: any) => {
          // Self-contained stylesheet injection into pane container
          if (!body.querySelector("style[data-paperpilot-style]")) {
            try {
              const doc = body.ownerDocument;
              const style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
              style.setAttribute("data-paperpilot-style", "true");
              style.textContent = `@import url("${this.rootURI}addon/style.css");`;
              body.insertBefore(style, body.firstChild);
            } catch (e) {}
          }

          const itemDetails = body.closest("item-details") as any;
          const tabID = itemDetails?.tabID || itemDetails?.dataset?.tabId || "";
          if (!tabID) {
            dump("[PaperPilot] ERROR: Cannot resolve tabID from item-details during PaperPilot onRender\n");
          }
          const mount = body.querySelector("#paperpilot-sidebar-mount") || body;
          let panel: SidebarPanel = (mount as any)._paperPilotPanel || (body as any)._paperPilotPanel;
          if (!panel) {
            try {
              panel = new SidebarPanel(mount);
              (mount as any)._paperPilotPanel = panel;
              (body as any)._paperPilotPanel = panel;
              PaperPilotSidebarController.attachPanel(panel, { tabID, body, itemDetails, item, mount });
              dump(`[PaperPilot] SidebarPanel constructed and bound successfully for tabID=${tabID}\n`);
            } catch (err: any) {
              dump(
                `[PaperPilot Sidebar] FATAL: Failed to construct SidebarPanel: ${err?.message || err}\n${err?.stack || ""}\n`
              );
              Zotero.logError?.(err);
            }
          } else {
            (mount as any)._paperPilotPanel = panel;
            (body as any)._paperPilotPanel = panel;
            PaperPilotSidebarController.attachPanel(panel, { tabID, body, itemDetails, item, mount });
          }
        },
        onDestroy: ({ body }: any) => {
          try {
            const itemDetails = body.closest("item-details") as any;
            const tabID = itemDetails?.tabID || itemDetails?.dataset?.tabId || "";
            const mount = body?.querySelector?.("#paperpilot-sidebar-mount");
            const panel = (mount as any)?._paperPilotPanel || (body as any)?._paperPilotPanel;
            if (panel) {
              if (typeof panel.destroy === "function") {
                panel.destroy();
              }
              PaperPilotSidebarController.detachPanel(panel, tabID);
            }
            if (mount) delete (mount as any)._paperPilotPanel;
            delete (body as any)._paperPilotPanel;
            dump(`[PaperPilot] item pane section destroyed for tabID=${tabID}\n`);
          } catch (e) {
            dump(`[PaperPilot] Error in section onDestroy: ${e}\n`);
          }
        },
        onAsyncRender: async ({ body, item }: any) => {
          const panel: SidebarPanel = (body as any)._paperPilotPanel;
          if (panel && item) {
            const regular = item.isRegularItem?.() ? item : item.parentItem || item;
            const title = regular?.getField ? regular.getField("title") : "文献";
            const attachment = item.isPDFAttachment?.() ? item : await regular?.getBestAttachment?.();
            await panel.loadPaper(regular?.key || "", title, regular?.id || 0, attachment?.id);
          }
        },
      });

      if (!key) {
        dump("[PaperPilot] ERROR: ItemPane registration returned false\n");
        throw new Error("PaperPilot ItemPane registration returned false");
      }

      this.sectionKey = key;
      PaperPilotSidebarController.setSectionKey(key);
      dump(`[PaperPilot] item pane section registered: ${key}\n`);
    } catch (e) {
      dump(`[PaperPilot] Failed to register ItemPane section: ${e}\n`);
    }
  }

  private initReaderFallbackHooks(): void {
    if (typeof Zotero === "undefined" || !Zotero.Reader) return;

    this.scanAndHookReaders();

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
