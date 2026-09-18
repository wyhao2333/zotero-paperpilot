import { PreferenceManager } from "./core/preferences";
import { EventBus } from "./core/event-bus";
import { FloatingBarManager } from "./modules/reader/floating-bar";
import { SidebarPanel } from "./modules/sidebar/panel";

export class PaperPilotPlugin {
  public id: string = "paperpilot@zotero.org";
  public rootURI: string = "";
  private initialized: boolean = false;
  private sectionKey: string = "";

  async init(data: any): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.rootURI = data?.rootURI || data?.resourceURI?.spec || "";

    dump("[PaperPilot] Initializing PaperPilot for Zotero 7-10...\n");
    PreferenceManager.init();

    // 1. Register PDF Reader Selection Popup Listener (Zotero 7-10 Native API)
    this.registerSelectionPopupListener();

    // 2. Register ItemPane & Reader Right Sidebar Section
    this.registerSidebarSection();
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

    this.initialized = false;
  }

  private registerSelectionPopupListener(): void {
    if (typeof Zotero === "undefined" || !Zotero.Reader) return;

    try {
      if (typeof Zotero.Reader.registerEventListener === "function") {
        Zotero.Reader.registerEventListener(
          "renderTextSelectionPopup",
          (event: any) => {
            FloatingBarManager.handleNativeSelectionPopup(event);
          },
          this.id
        );
        dump("[PaperPilot] Successfully registered renderTextSelectionPopup listener.\n");
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
          const panel = new SidebarPanel(mount);
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
}

export const PaperPilot = new PaperPilotPlugin();
