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
    context?: { tabID?: string; body?: any; itemDetails?: any; item?: any; mount?: any }
  ): void {
    const tabID = context?.tabID || "";
    if (tabID) {
      this.panelsByTabID.set(tabID, panel);
    }
    if (context?.body) {
      this.panelsByBody.set(context.body, panel);
      (context.body as any)._paperPilotPanel = panel;
    }
    if (context?.mount) {
      (context.mount as any)._paperPilotPanel = panel;
    }

    // Check if there is an active pending delivery promise waiting for this tabID
    if (tabID && this.pendingDeliveries.has(tabID)) {
      const delivery = this.pendingDeliveries.get(tabID)!;
      this.pendingDeliveries.delete(tabID);
      clearTimeout(delivery.timer);
      try {
        const delivered =
          typeof panel.handlePendingAction === "function"
            ? panel.handlePendingAction(delivery.action) === true
            : false;
        dump(`[PaperPilot] ask action delivered via pending delivery (result=${delivered})\n`);
        delivery.resolve(delivered);
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

  static resolveReaderTabID(win: any, reader?: any): string {
    if (reader) {
      if (reader._tabID) return String(reader._tabID);
      if (reader.tabID) return String(reader.tabID);
    }
    if (win?.Zotero_Tabs?.selectedID) {
      return String(win.Zotero_Tabs.selectedID);
    }
    return "";
  }

  /**
   * Dispatches an "ask" action with strict end-to-end verification.
   * Directly locates the actual Reader itemDetails and PaperPilot section mount.
   */
  static async openAsk(options: {
    selectedText: string;
    reader?: any;
    attachmentID?: number;
  }): Promise<boolean> {
    const win = typeof Zotero !== "undefined" && Zotero.getMainWindow ? Zotero.getMainWindow() : null;
    if (!win) {
      dump("[PaperPilot Ask] ERROR: Zotero main window not found\n");
      throw new Error("Zotero main window not found");
    }

    const tabID = this.resolveReaderTabID(win, options.reader);
    dump(`[PaperPilot Ask] selected tabID=${tabID}\n`);

    const action: PendingAction = {
      type: "ask",
      selectedText: options.selectedText,
      attachmentID: options.attachmentID,
      tabID,
    };

    // 1. Expand ContextPane
    this.expandContextPane(win);

    // 2. Retrieve reader item-details context with bounded retry (10 * 50ms)
    const itemDetails = await this.getItemDetailsContextWithRetry(win, tabID);
    const itemDetailsFound = !!itemDetails;
    dump(`[PaperPilot Ask] itemDetails found=${itemDetailsFound}\n`);
    dump(`[PaperPilot Ask] sectionKey=${this.sectionKey}\n`);

    if (!itemDetails) {
      dump("[PaperPilot Ask] pane found=false\n");
      dump("[PaperPilot Ask] mount found=false\n");
      dump("[PaperPilot Ask] panel instance found=false\n");
      dump("[PaperPilot Ask] quote delivered=false\n");
      throw new Error(`Reader item-details context not found for tabID=${tabID}`);
    }

    // 3. Scroll to PaperPilot section
    if (typeof itemDetails.scrollToPane === "function") {
      try {
        await itemDetails.scrollToPane(this.sectionKey, "smooth");
      } catch (scrollErr) {
        dump(`[PaperPilot Ask] Warning: scrollToPane failed: ${scrollErr}\n`);
      }
    }

    // 4. Locate pane, mount, and panel instance directly from current Reader DOM with bounded wait (1500ms)
    let pane: any = null;
    let mount: any = null;
    let panel: any = null;

    const startTime = Date.now();
    while (Date.now() - startTime < 1500) {
      if (typeof itemDetails.getPane === "function") {
        pane = itemDetails.getPane(this.sectionKey);
      }
      if (!pane && typeof itemDetails.querySelector === "function") {
        pane =
          itemDetails.querySelector(`[data-section-id="${this.sectionKey}"], #${this.sectionKey}`) ||
          itemDetails.querySelector("#paperpilot-sidebar-mount")?.closest?.(".item-pane-section");
      }

      mount =
        pane?.querySelector?.("#paperpilot-sidebar-mount") ||
        itemDetails.querySelector?.("#paperpilot-sidebar-mount");

      panel =
        (mount as any)?._paperPilotPanel ||
        (mount?.parentElement as any)?._paperPilotPanel ||
        (pane as any)?._paperPilotPanel ||
        (tabID ? this.panelsByTabID.get(tabID) : null);

      if (panel) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const paneFound = !!pane;
    const mountFound = !!mount;
    const panelFound = !!panel;

    dump(`[PaperPilot Ask] pane found=${paneFound}\n`);
    dump(`[PaperPilot Ask] mount found=${mountFound}\n`);
    dump(`[PaperPilot Ask] panel instance found=${panelFound}\n`);

    if (!panel) {
      dump("[PaperPilot Ask] quote delivered=false\n");
      if (paneFound && !mountFound) {
        throw new Error(`PaperPilot pane found for sectionKey=${this.sectionKey} but mount element not found`);
      }
      if (mountFound && !panelFound) {
        throw new Error(`PaperPilot mount element found but panel instance _paperPilotPanel not attached`);
      }
      throw new Error(`PaperPilot panel not found in reader itemDetails for tabID=${tabID}`);
    }

    // 5. Deliver quote strictly and check result
    let delivered = false;
    if (typeof panel.handlePendingAction === "function") {
      delivered = panel.handlePendingAction(action) === true;
    }

    dump(`[PaperPilot Ask] quote delivered=${delivered}\n`);

    if (!delivered) {
      throw new Error("Panel handlePendingAction returned false for quote delivery");
    }

    return true;
  }

  /**
   * Dispatches an "interpret" action to current reader sidebar.
   */
  static async openInterpret(options: {
    selectedText: string;
    reader?: any;
    attachmentID?: number;
  }): Promise<boolean> {
    const win = typeof Zotero !== "undefined" && Zotero.getMainWindow ? Zotero.getMainWindow() : null;
    if (!win) {
      dump("[PaperPilot] ERROR: Zotero main window not found\n");
      throw new Error("Zotero main window not found");
    }

    const tabID = this.resolveReaderTabID(win, options.reader);
    const action: PendingAction = {
      type: "interpret",
      selectedText: options.selectedText,
      attachmentID: options.attachmentID,
      tabID,
    };

    try {
      this.expandContextPane(win);

      const itemDetails = await this.getItemDetailsContextWithRetry(win, tabID);
      if (itemDetails && typeof itemDetails.scrollToPane === "function") {
        await itemDetails.scrollToPane(this.sectionKey, "smooth");
      }

      let pane: any = null;
      let mount: any = null;
      let panel: any = null;

      const startTime = Date.now();
      while (Date.now() - startTime < 1200) {
        if (typeof itemDetails?.getPane === "function") {
          pane = itemDetails.getPane(this.sectionKey);
        }
        mount =
          pane?.querySelector?.("#paperpilot-sidebar-mount") ||
          itemDetails?.querySelector?.("#paperpilot-sidebar-mount");

        panel =
          (mount as any)?._paperPilotPanel ||
          (pane as any)?._paperPilotPanel ||
          (tabID ? this.panelsByTabID.get(tabID) : null);

        if (panel) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      if (panel && typeof panel.handlePendingAction === "function") {
        const delivered = panel.handlePendingAction(action) === true;
        dump(`[PaperPilot] interpret action delivered=${delivered}\n`);
        return delivered;
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
        const active = win.ZoteroContextPane.context._activeItemContext;
        if (!tabID || !active.tabID || active.tabID === tabID) {
          return active;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return null;
  }
}
