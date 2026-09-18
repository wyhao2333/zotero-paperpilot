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
  dump("[PaperPilot] Starting startup sequence for Zotero 7-10...\n");
  if (!rootURI && resourceURI) {
    rootURI = resourceURI.spec;
  }
  if (!rootURI) {
    rootURI = "chrome://paperpilot/content/";
  }
  if (!rootURI.endsWith("/")) {
    rootURI += "/";
  }

  await waitForZotero();

  // 1. Register chrome URI for extension assets
  try {
    const aomStartup = Components.classes[
      "@mozilla.org/addons/addon-manager-startup;1"
    ].getService(Components.interfaces.amIAddonManagerStartup);
    const manifestURI = Services.io.newURI(rootURI + "manifest.json");
    chromeHandle = aomStartup.registerChrome(manifestURI, [
      ["content", "paperpilot", rootURI + "chrome/content/"],
    ]);
    dump("[PaperPilot] Chrome registered: chrome://paperpilot/content/\n");
  } catch (e) {
    dump("[PaperPilot] registerChrome notice: " + e + "\n");
  }

  // 2. Register native Zotero Preference Pane in Edit -> Settings
  try {
    if (typeof Zotero !== "undefined" && Zotero.PreferencePanes?.register) {
      Zotero.PreferencePanes.register({
        pluginID: "paperpilot@zotero.org",
        src: rootURI + "chrome/content/preferences.xhtml",
        scripts: [rootURI + "chrome/content/preferences.js"],
        label: "PaperPilot",
        image: rootURI + "addon/icon.svg",
      });
      dump("[PaperPilot] Zotero.PreferencePanes registered successfully.\n");
    }
  } catch (e) {
    dump("[PaperPilot] Error registering PreferencePanes: " + e + "\n");
  }

  // 3. Load Main Script using loadSubScript (standard for Zotero 7-10 plugins)
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

    Services.scriptloader.loadSubScript(scriptPath, ctx, "UTF-8");
    dump("[PaperPilot] Main script loaded via scriptloader.\n");

    const pluginInstance =
      (typeof Zotero !== "undefined" && Zotero.PaperPilot) ||
      ctx.PaperPilot ||
      (ctx.PaperPilotBundle && ctx.PaperPilotBundle.PaperPilot);

    if (pluginInstance && typeof pluginInstance.init === "function") {
      await pluginInstance.init({ id, version, rootURI });
      dump("[PaperPilot] PaperPilot.init completed successfully.\n");
    } else {
      dump("[PaperPilot] Warning: PaperPilot plugin instance not found in context.\n");
    }
  } catch (e) {
    dump("[PaperPilot] Fatal startup error: " + e + "\n" + (e.stack || "") + "\n");
    if (typeof Components !== "undefined") {
      Components.utils.reportError(e);
    }
  }
}

async function onMainWindowLoad({ window }) {
  try {
    const pluginInstance = typeof Zotero !== "undefined" ? Zotero.PaperPilot : null;
    if (pluginInstance && typeof pluginInstance.onMainWindowLoad === "function") {
      await pluginInstance.onMainWindowLoad(window);
    }
  } catch (e) {
    dump("[PaperPilot] onMainWindowLoad error: " + e + "\n");
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
