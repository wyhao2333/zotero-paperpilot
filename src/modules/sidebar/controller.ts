export type PendingAction =
  | {
      type: "ask";
      selectedText: string;
      attachmentID?: number;
      tabID?: string;
    }
  | {
      type: "interpret";
      selectedText: string;
      attachmentID?: number;
      tabID?: string;
    };

export class PaperPilotSidebarController {
  private static sectionKey: string = "paperpilot-section";
  private static panelsByTabID: Map<string, any> = new Map();
  private static panelsByBody: WeakMap<any, any> = new WeakMap();
  private static pendingActions: Map<string, PendingAction> = new Map();

  static setSectionKey(key: string): void {
    if (key) {
      this.sectionKey = key;
    }
  }

  static getSectionKey(): string {
    return this.sectionKey;
  }

  /**
   * Called by SidebarPanel when mounted/rendered to register with the current tab context.
   */
  static attachPanel(panel: any, context?: { tabID?: string; body?: any; item?: any }): void {
    const tabID = context?.tabID || "";
    if (tabID) {
      this.panelsByTabID.set(tabID, panel);
    }
    if (context?.body) {
      this.panelsByBody.set(context.body, panel);
    }

    // Check if there is a pending action queued for this tab
    const actionKey = tabID || Array.from(this.pendingActions.keys())[0];
    if (actionKey && this.pendingActions.has(actionKey)) {
      const action = this.pendingActions.get(actionKey)!;
      this.pendingActions.delete(actionKey);
      try {
        if (typeof panel.handlePendingAction === "function") {
          panel.handlePendingAction(action);
          dump("[PaperPilot] ask action delivered\n");
        }
      } catch (e) {
        dump(`[PaperPilot] ERROR consuming pending action: ${e}\n`);
      }
    }
  }

  static detachPanel(panel: any, tabID?: string): void {
    if (tabID && this.panelsByTabID.get(tabID) === panel) {
      this.panelsByTabID.delete(tabID);
    }
  }

  /**
   * Dispatches an "ask" action:
   * 1. Records pending action for current reader tab
   * 2. Opens ContextPane & sets mode='item'
   * 3. Retrieves reader item-details context with retry
   * 4. Scrolls smoothly to PaperPilot section
   * 5. Delivers pending quote & focuses input
   */
  static async openAsk(options: {
    selectedText: string;
    reader?: any;
    attachmentID?: number;
  }): Promise<boolean> {
    dump("[PaperPilot] ask requested\n");

    const win = typeof Zotero !== "undefined" && Zotero.getMainWindow ? Zotero.getMainWindow() : null;
    if (!win) {
      dump("[PaperPilot] ERROR: Zotero main window not found\n");
      throw new Error("Zotero main window not found");
    }

    const tabID = win.Zotero_Tabs?.selectedID || (options.reader?._tabID ? String(options.reader._tabID) : "");
    const action: PendingAction = {
      type: "ask",
      selectedText: options.selectedText,
      attachmentID: options.attachmentID,
      tabID,
    };

    if (tabID) {
      this.pendingActions.set(tabID, action);
    } else {
      this.pendingActions.set("default", action);
    }

    try {
      // 1. Expand ContextPane
      this.expandContextPane(win);
      dump("[PaperPilot] context pane expanded\n");

      // 2. Retrieve reader item-details context with retry (max 10 * 50ms)
      const itemDetails = await this.getItemDetailsContextWithRetry(win, tabID);
      if (!itemDetails) {
        dump(`[PaperPilot] ERROR: current reader item-details not found for tabID=${tabID}\n`);
        throw new Error(`Reader item-details context not found for tabID=${tabID}`);
      }
      dump("[PaperPilot] current reader item-details found\n");

      // 3. Scroll to PaperPilot section
      dump(`[PaperPilot] scrolling to pane: ${this.sectionKey}\n`);
      if (typeof itemDetails.scrollToPane === "function") {
        await itemDetails.scrollToPane(this.sectionKey, "smooth");
      }

      // 4. Deliver action to current panel
      let targetPanel = (tabID ? this.panelsByTabID.get(tabID) : null) || itemDetails._paperPilotPanel;

      // Small retry loop (max 5 * 50ms) if onRender has not executed yet
      if (!targetPanel) {
        for (let i = 0; i < 5; i++) {
          targetPanel = (tabID ? this.panelsByTabID.get(tabID) : null) || itemDetails._paperPilotPanel;
          if (targetPanel) break;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      if (targetPanel && typeof targetPanel.handlePendingAction === "function") {
        targetPanel.handlePendingAction(action);
        if (tabID) this.pendingActions.delete(tabID);
        dump("[PaperPilot] ask action delivered\n");
        return true;
      }

      // If panel is still queued for upcoming onRender
      if (this.pendingActions.has(tabID) || this.pendingActions.has("default")) {
        dump("[PaperPilot] ask action delivered to pending queue\n");
        return true;
      }

      dump("[PaperPilot] ERROR: Target panel not found for ask action delivery\n");
      return false;
    } catch (err: any) {
      dump(`[PaperPilot] ERROR in openAsk: ${err.message || err}\n`);
      throw err;
    }
  }

  /**
   * Dispatches an "interpret" action to current reader sidebar.
   */
  static async openInterpret(options: {
    selectedText: string;
    reader?: any;
    attachmentID?: number;
  }): Promise<boolean> {
    dump("[PaperPilot] interpret requested\n");

    const win = typeof Zotero !== "undefined" && Zotero.getMainWindow ? Zotero.getMainWindow() : null;
    if (!win) {
      dump("[PaperPilot] ERROR: Zotero main window not found\n");
      throw new Error("Zotero main window not found");
    }

    const tabID = win.Zotero_Tabs?.selectedID || (options.reader?._tabID ? String(options.reader._tabID) : "");
    const action: PendingAction = {
      type: "interpret",
      selectedText: options.selectedText,
      attachmentID: options.attachmentID,
      tabID,
    };

    if (tabID) {
      this.pendingActions.set(tabID, action);
    }

    try {
      this.expandContextPane(win);
      dump("[PaperPilot] context pane expanded\n");

      const itemDetails = await this.getItemDetailsContextWithRetry(win, tabID);
      if (itemDetails && typeof itemDetails.scrollToPane === "function") {
        dump(`[PaperPilot] scrolling to pane: ${this.sectionKey}\n`);
        await itemDetails.scrollToPane(this.sectionKey, "smooth");
      }

      let targetPanel = (tabID ? this.panelsByTabID.get(tabID) : null) || itemDetails?._paperPilotPanel;
      if (targetPanel && typeof targetPanel.handlePendingAction === "function") {
        targetPanel.handlePendingAction(action);
        if (tabID) this.pendingActions.delete(tabID);
        dump("[PaperPilot] interpret action delivered\n");
        return true;
      }
      return true;
    } catch (err: any) {
      dump(`[PaperPilot] ERROR in openInterpret: ${err.message || err}\n`);
      throw err;
    }
  }

  /**
   * Reliably expands Zotero ContextPane and sets mode to 'item'.
   */
  private static expandContextPane(win: any): void {
    if (win.ZoteroContextPane) {
      if (win.ZoteroContextPane.splitter) {
        win.ZoteroContextPane.splitter.setAttribute("state", "open");
      }
      win.ZoteroContextPane.collapsed = false;
      if (win.ZoteroContextPane.context) {
        win.ZoteroContextPane.context.mode = "item";
      }
      if (typeof win.ZoteroContextPane.show === "function") {
        try {
          win.ZoteroContextPane.show();
        } catch (e) {}
      }
    }
  }

  /**
   * Retrieves current reader tab's item details context with bounded retry.
   */
  private static async getItemDetailsContextWithRetry(win: any, tabID: string): Promise<any> {
    for (let i = 0; i < 10; i++) {
      if (win.ZoteroContextPane?.context?._getItemContext) {
        const itemDetails = win.ZoteroContextPane.context._getItemContext(tabID);
        if (itemDetails) return itemDetails;
      }
      // Fallback: active itemDetails if tabID lookup returned null
      if (win.ZoteroContextPane?.context?._activeItemContext) {
        return win.ZoteroContextPane.context._activeItemContext;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return null;
  }
}
