/**
 * PaperPilot Bootstrap Lifecycle for Zotero 7-10
 */
/* global Components, Services, Zotero, dump, APP_SHUTDOWN */

var chromeHandle;

function install(data, reason) {}

async function waitForZotero() {
  if (typeof Zotero !== "undefined") {
    if (Zotero.initializationPromise) await Zotero.initializationPromise;
    if (Zotero.unlockPromise) await Zotero.unlockPromise;
    if (Zotero.uiReadyPromise) await Zotero.uiReadyPromise;
  }
}

async function startup({ id, version, resourceURI, rootURI } = {}, reason) {
  dump("[PaperPilot] PaperPilot bootstrap started\n");

  // 1. Resolve & normalize addon rootURI
  let resolvedRoot = rootURI;
  if (!resolvedRoot && resourceURI && resourceURI.spec) {
    resolvedRoot = resourceURI.spec;
  }
  if (!resolvedRoot && typeof Zotero !== "undefined" && typeof Zotero.getAddonRootURI === "function") {
    try {
      resolvedRoot = Zotero.getAddonRootURI("paperpilot@zotero.org");
    } catch (e) {}
  }
  if (!resolvedRoot) {
    const fatalErr = new Error("[PaperPilot] Fatal: Failed to resolve addon rootURI for paperpilot@zotero.org");
    dump(fatalErr.message + "\n" + (fatalErr.stack || "") + "\n");
    throw fatalErr;
  }

  // Ensure rootURI has exactly one trailing slash
  resolvedRoot = resolvedRoot.replace(/\/+$/, "") + "/";
  rootURI = resolvedRoot;
  dump(`[PaperPilot] addon root resolved: ${rootURI}\n`);

  await waitForZotero();

  // 2. Register chrome URI for extension assets
  try {
    const aomStartup = Components.classes[
      "@mozilla.org/addons/addon-manager-startup;1"
    ].getService(Components.interfaces.amIAddonManagerStartup);
    const manifestURI = Services.io.newURI(rootURI + "manifest.json");
    chromeHandle = aomStartup.registerChrome(manifestURI, [
      ["content", "paperpilot", rootURI + "chrome/content/"],
      ["locale", "paperpilot", "en-US", rootURI + "addon/locale/en-US/"],
      ["locale", "paperpilot", "zh-CN", rootURI + "addon/locale/zh-CN/"],
    ]);
    dump("[PaperPilot] Chrome registered: chrome://paperpilot/content/ & locales\n");
  } catch (e) {
    dump("[PaperPilot] registerChrome notice: " + e + "\n");
  }

  // Insert Fluent localization into main windows
  try {
    const mainWindows = typeof Zotero !== "undefined" && Zotero.getMainWindows
      ? Zotero.getMainWindows()
      : (typeof Zotero !== "undefined" && Zotero.getMainWindow ? [Zotero.getMainWindow()].filter(Boolean) : []);
    for (const win of mainWindows) {
      try {
        win.MozXULElement?.insertFTLIfNeeded?.("paperpilot-mainWindow.ftl");
      } catch (e) {}
    }
  } catch (e) {}

  // 3. Register native Zotero Preference Pane (Zotero 7/10 async API)
  try {
    if (typeof Zotero !== "undefined" && Zotero.PreferencePanes?.register) {
      const paneID = await Zotero.PreferencePanes.register({
        id: "paperpilot-preferences",
        pluginID: "paperpilot@zotero.org",
        src: rootURI + "chrome/content/preferences.xhtml",
        scripts: [rootURI + "chrome/content/preferences.js"],
        label: "PaperPilot",
        image: rootURI + "addon/icon.svg",
      });
      dump(`[PaperPilot] preference pane registered, paneID=${paneID}\n`);
    } else {
      dump("[PaperPilot] Zotero.PreferencePanes.register not available\n");
    }
  } catch (e) {
    dump(`[PaperPilot] Error registering PreferencePanes: ${e}\n${e.stack || ""}\n`);
    if (typeof Components !== "undefined") {
      Components.utils.reportError(e);
    }
  }

  // 4. Load Main Script using loadSubScript (IIFE bundle)
  try {
    const scriptPath = rootURI + "chrome/content/scripts/index.js";
    const ctx = {
      rootURI,
      Zotero,
      Services,
      Components,
      dump,
      window: typeof window !== "undefined" ? window : undefined,
    };
    ctx._globalThis = ctx;

    Services.scriptloader.loadSubScript(scriptPath, ctx, "UTF-8");
    dump("[PaperPilot] main bundle loaded\n");

    const pluginInstance =
      (typeof Zotero !== "undefined" && Zotero.PaperPilot) ||
      ctx.PaperPilot ||
      (ctx.PaperPilotBundle && ctx.PaperPilotBundle.PaperPilot);

    if (!pluginInstance || typeof pluginInstance.init !== "function") {
      throw new Error(`[PaperPilot] Fatal: PaperPilot plugin instance not found or init is not a function (found=${typeof pluginInstance})`);
    }

    dump("[PaperPilot] plugin instance found\n");
    dump("[PaperPilot] PaperPilot.init started\n");
    await pluginInstance.init({ id, version, rootURI });
    dump("[PaperPilot] PaperPilot.init completed\n");
  } catch (e) {
    dump(`[PaperPilot] Fatal startup error: ${e}\n${e.stack || ""}\n`);
    if (typeof Components !== "undefined") {
      Components.utils.reportError(e);
    }
    throw e;
  }
}

async function onMainWindowLoad({ window }) {
  try {
    try {
      window.MozXULElement?.insertFTLIfNeeded?.("paperpilot-mainWindow.ftl");
    } catch (e) {}

    const pluginInstance = typeof Zotero !== "undefined" ? Zotero.PaperPilot : null;
    if (pluginInstance && typeof pluginInstance.onMainWindowLoad === "function") {
      await pluginInstance.onMainWindowLoad(window);
    }
  } catch (e) {
    dump("[PaperPilot] onMainWindowLoad error: " + e + "\n");
  }
}

async function onMainWindowUnload({ window }) {
  try {
    const pluginInstance = typeof Zotero !== "undefined" ? Zotero.PaperPilot : null;
    if (pluginInstance && typeof pluginInstance.onMainWindowUnload === "function") {
      await pluginInstance.onMainWindowUnload(window);
    }
  } catch (e) {
    dump("[PaperPilot] onMainWindowUnload error: " + e + "\n");
  }
}

function shutdown({ id, version, resourceURI, rootURI } = {}, reason) {
  if (reason === APP_SHUTDOWN) return;
  dump("[PaperPilot] Shutting down PaperPilot...\n");

  try {
    const pluginInstance = typeof Zotero !== "undefined" ? Zotero.PaperPilot : null;
    if (pluginInstance && typeof pluginInstance.destroy === "function") {
      pluginInstance.destroy();
    }
    if (typeof Zotero !== "undefined" && Zotero.PaperPilot) {
      delete Zotero.PaperPilot;
    }
  } catch (e) {
    dump("[PaperPilot] Error during shutdown: " + e + "\n");
  }

  if (chromeHandle) {
    try {
      chromeHandle.destruct();
    } catch (e) {}
    chromeHandle = null;
  }
}

function uninstall(data, reason) {}
