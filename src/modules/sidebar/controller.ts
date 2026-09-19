export type PendingAction =
  | {
      type: "ask";
      selectedText: string;
      attachmentID?: number;
    }
  | {
      type: "interpret";
      selectedText: string;
      attachmentID?: number;
    };

export class PaperPilotSidebarController {
  private static sectionKey: string = "paperpilot-section";
  private static pendingAction: PendingAction | null = null;
  private static activePanel: any = null;

  static setSectionKey(key: string): void {
    if (key) {
      this.sectionKey = key;
    }
  }

  static getSectionKey(): string {
    return this.sectionKey;
  }

  /**
   * Called by SidebarPanel when mounted/rendered. Consumes any queued pending action.
   */
  static attachPanel(panel: any): void {
    this.activePanel = panel;
    if (this.pendingAction) {
      const action = this.pendingAction;
      this.pendingAction = null;
      try {
        if (typeof panel.handlePendingAction === "function") {
          panel.handlePendingAction(action);
        }
      } catch (e) {
        dump(`[PaperPilot] Error consuming pending action: ${e}\n`);
      }
    }
  }

  static detachPanel(panel: any): void {
    if (this.activePanel === panel) {
      this.activePanel = null;
    }
  }

  /**
   * Dispatches an "ask" action: opens right sidebar, scrolls to PaperPilot, quotes text, focuses input.
   */
  static async openAsk(options: {
    selectedText: string;
    reader?: any;
    attachmentID?: number;
  }): Promise<void> {
    dump("[PaperPilot] ask sidebar opened\n");
    const action: PendingAction = {
      type: "ask",
      selectedText: options.selectedText,
      attachmentID: options.attachmentID,
    };

    this.pendingAction = action;
    this.openContextPane();
    await this.scrollToPane();

    if (this.activePanel && typeof this.activePanel.handlePendingAction === "function") {
      const act = this.pendingAction;
      this.pendingAction = null;
      this.activePanel.handlePendingAction(act);
    }
  }

  /**
   * Dispatches an "interpret" action: opens right sidebar, scrolls to PaperPilot, executes interpretation.
   */
  static async openInterpret(options: {
    selectedText: string;
    reader?: any;
    attachmentID?: number;
  }): Promise<void> {
    dump("[PaperPilot] interpretation started\n");
    const action: PendingAction = {
      type: "interpret",
      selectedText: options.selectedText,
      attachmentID: options.attachmentID,
    };

    this.pendingAction = action;
    this.openContextPane();
    await this.scrollToPane();

    if (this.activePanel && typeof this.activePanel.handlePendingAction === "function") {
      const act = this.pendingAction;
      this.pendingAction = null;
      this.activePanel.handlePendingAction(act);
    }
  }

  /**
   * Opens Zotero's ContextPane splitter.
   */
  static openContextPane(): void {
    try {
      const win = typeof Zotero !== "undefined" && Zotero.getMainWindow ? Zotero.getMainWindow() : null;
      if (!win) return;

      if (win.ZoteroContextPane) {
        if (win.ZoteroContextPane.splitter) {
          win.ZoteroContextPane.splitter.setAttribute("state", "open");
        }
        if (typeof win.ZoteroContextPane.show === "function") {
          try {
            win.ZoteroContextPane.show();
          } catch (e) {}
        }
      }
    } catch (e) {
      dump(`[PaperPilot] Error opening ZoteroContextPane: ${e}\n`);
    }
  }

  /**
   * Scrolls to PaperPilot's registered ItemPane section.
   */
  static async scrollToPane(): Promise<void> {
    try {
      const win = typeof Zotero !== "undefined" && Zotero.getMainWindow ? Zotero.getMainWindow() : null;
      if (!win || !win.document) return;

      const doc = win.document;
      const key = this.sectionKey;

      // 1. Zotero native itemDetails scrollToPane
      const itemDetails = doc.getElementById("zotero-item-pane") || (win as any).ZoteroItemPane;
      if (itemDetails && typeof itemDetails.scrollToPane === "function" && key) {
        try {
          await itemDetails.scrollToPane(key, "smooth");
        } catch (e) {}
      }

      // 2. Sidenav tab button activation fallback
      const sidenavBtn =
        doc.querySelector(`#zotero-item-pane-sidenav [data-pane="${key}"]`) ||
        doc.querySelector(`[data-pane="${key}"]`) ||
        doc.querySelector(`[data-pane="paperpilot-section"]`);
      if (sidenavBtn && typeof (sidenavBtn as any).click === "function") {
        try {
          (sidenavBtn as any).click();
        } catch (e) {}
      }
    } catch (e) {
      dump(`[PaperPilot] Error scrolling to PaperPilot pane: ${e}\n`);
    }
  }
}
