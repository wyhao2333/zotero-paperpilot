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

interface PendingDelivery {
  action: PendingAction;
  resolve: (success: boolean) => void;
  timer: any;
}

export class PaperPilotSidebarController {
  private static sectionKey: string = "paperpilot-section";
  private static panelsByTabID: Map<string, any> = new Map();
  private static panelsByBody: WeakMap<any, any> = new WeakMap();
  private static pendingActions: Map<string, PendingAction> = new Map();
  private static pendingDeliveries: Map<string, PendingDelivery> = new Map();

  static setSectionKey(key: string): void {
    if (key) {
      this.sectionKey = key;
    }
  }

  static getSectionKey(): string {
    return this.sectionKey;
  }

  /**
   * Called by ItemPane onRender with tabID and context.
   */
  static attachPanel(
    panel: any,
    context?: { tabID?: string; body?: any; itemDetails?: any; item?: any }
  ): void {
    const tabID = context?.tabID || "";
    if (tabID) {
      this.panelsByTabID.set(tabID, panel);
    }
    if (context?.body) {
      this.panelsByBody.set(context.body, panel);
    }

    // Check if there is an active pending delivery promise waiting for this tabID
    if (tabID && this.pendingDeliveries.has(tabID)) {
      const delivery = this.pendingDeliveries.get(tabID)!;
      this.pendingDeliveries.delete(tabID);
      clearTimeout(delivery.timer);
      try {
        const delivered =
          typeof panel.handlePendingAction === "function"
            ? panel.handlePendingAction(delivery.action)
            : false;
        dump(`[PaperPilot] ask action delivered via pending delivery (result=${delivered})\n`);
        delivery.resolve(!!delivered);
      } catch (e) {
        dump(`[PaperPilot] ERROR in pending delivery execution: ${e}\n`);
        delivery.resolve(false);
      }
      return;
    }

    // Secondary race fallback
    const actionKey = tabID || Array.from(this.pendingActions.keys())[0];
    if (actionKey && this.pendingActions.has(actionKey)) {
      const action = this.pendingActions.get(actionKey)!;
      this.pendingActions.delete(actionKey);
      try {
        if (typeof panel.handlePendingAction === "function") {
          panel.handlePendingAction(action);
          dump("[PaperPilot] action delivered from pending actions\n");
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
    for (const [id, p] of this.panelsByTabID.entries()) {
      if (p === panel) {
        this.panelsByTabID.delete(id);
      }
    }
  }

  static async waitForPanel(tabID: string, timeoutMs = 1500): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const p = this.panelsByTabID.get(tabID);
      if (p) return p;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  }

  /**
   * Dispatches an "ask" action with strict end-to-end verification.
   * Returns true ONLY if:
   * 1. Reader itemDetails found
   * 2. PaperPilot section scrolled
   * 3. Target tab SidebarPanel found
   * 4. panel.handlePendingAction(action) executes and returns true
   * 5. Quote banner displayed and input focused
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

    try {
      // 1. Expand ContextPane
      this.expandContextPane(win);
      dump("[PaperPilot] context pane expanded\n");

      // 2. Retrieve reader item-details context with retry
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
      let targetPanel = tabID ? this.panelsByTabID.get(tabID) : null;

      if (!targetPanel) {
        // Prepare delivery promise before waiting for panel to attach
        const deliveryPromise = new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => {
            if (tabID && this.pendingDeliveries.has(tabID)) {
              this.pendingDeliveries.delete(tabID);
            }
            dump(`[PaperPilot] Delivery timeout for tabID=${tabID}\n`);
            resolve(false);
          }, 1500);

          if (tabID) {
            this.pendingDeliveries.set(tabID, { action, resolve, timer });
          }
        });

        // Wait for panel to appear via polling or onRender
        targetPanel = await this.waitForPanel(tabID, 1500);

        if (targetPanel && typeof targetPanel.handlePendingAction === "function") {
          // If panel appeared, deliver directly if delivery promise not already settled
          if (tabID && this.pendingDeliveries.has(tabID)) {
            const delivery = this.pendingDeliveries.get(tabID)!;
            this.pendingDeliveries.delete(tabID);
            clearTimeout(delivery.timer);
            const delivered = targetPanel.handlePendingAction(action);
            delivery.resolve(!!delivered);
            return !!delivered;
          }
        }

        const delivered = await deliveryPromise;
        if (!delivered) {
          dump(`[PaperPilot] ERROR: PaperPilot panel not rendered or delivery failed for tab ${tabID}\n`);
          throw new Error(`PaperPilot panel not rendered for tab ${tabID}`);
        }
        return true;
      }

      // Panel already available, execute synchronously
      if (typeof targetPanel.handlePendingAction === "function") {
        const delivered = targetPanel.handlePendingAction(action);
        if (!delivered) {
          dump("[PaperPilot] ERROR: handlePendingAction returned false\n");
          return false;
        }
        dump("[PaperPilot] ask action delivered\n");
        return true;
      }

      dump("[PaperPilot] ERROR: Target panel has no handlePendingAction\n");
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

    try {
      this.expandContextPane(win);
      dump("[PaperPilot] context pane expanded\n");

      const itemDetails = await this.getItemDetailsContextWithRetry(win, tabID);
      if (itemDetails && typeof itemDetails.scrollToPane === "function") {
        dump(`[PaperPilot] scrolling to pane: ${this.sectionKey}\n`);
        await itemDetails.scrollToPane(this.sectionKey, "smooth");
      }

      let targetPanel = (tabID ? this.panelsByTabID.get(tabID) : null) || (await this.waitForPanel(tabID, 1000));
      if (targetPanel && typeof targetPanel.handlePendingAction === "function") {
        const delivered = targetPanel.handlePendingAction(action);
        dump("[PaperPilot] interpret action delivered\n");
        return !!delivered;
      }
      return false;
    } catch (err: any) {
      dump(`[PaperPilot] ERROR in openInterpret: ${err.message || err}\n`);
      throw err;
    }
  }

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

  private static async getItemDetailsContextWithRetry(win: any, tabID: string): Promise<any> {
    for (let i = 0; i < 10; i++) {
      if (win.ZoteroContextPane?.context?._getItemContext) {
        const itemDetails = win.ZoteroContextPane.context._getItemContext(tabID);
        if (itemDetails) return itemDetails;
      }
      if (win.ZoteroContextPane?.context?._activeItemContext) {
        return win.ZoteroContextPane.context._activeItemContext;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return null;
  }
}
