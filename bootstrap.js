/**
 * PaperPilot Add-on Lifecycle Bootstrap for Zotero 7-10
 */
/* global ChromeUtils, Services, Zotero, dump */

var PaperPilotInstance;

function install(data, reason) {}

async function startup(data, reason) {
  dump("[PaperPilot] Starting PaperPilot Bootstrap...\n");
  const rootURI = data.rootURI || data.resourceURI.spec;

  try {
    // 1. Wait for Zotero core and UI ready
    if (typeof Zotero !== "undefined") {
      await Promise.all([
        Zotero.initializationPromise,
        Zotero.unlockPromise,
        Zotero.uiReadyPromise,
      ]);
    }

    // 2. Register native Preference Pane in Zotero -> Settings
    if (typeof Zotero !== "undefined" && Zotero.PreferencePanes?.register) {
      Zotero.PreferencePanes.register({
        pluginID: "paperpilot@zotero.org",
        src: rootURI + "chrome/content/preferences.xhtml",
        scripts: [rootURI + "chrome/content/preferences.js"],
        label: "PaperPilot",
        image: rootURI + "addon/icon.svg",
      });
      dump("[PaperPilot] PreferencePanes registered successfully.\n");
    }

    // 3. Import and initialize main plugin logic
    const module = ChromeUtils.importESModule(rootURI + "addon/index.js");
    PaperPilotInstance = module.PaperPilot;
    if (PaperPilotInstance && typeof PaperPilotInstance.init === "function") {
      await PaperPilotInstance.init(data);
    }
    dump("[PaperPilot] Plugin started successfully.\n");
  } catch (err) {
    dump("[PaperPilot] Failed during startup: " + err + "\n");
    if (typeof Components !== "undefined") {
      Components.utils.reportError(err);
    }
  }
}

function shutdown(data, reason) {
  dump("[PaperPilot] Shutting down...\n");
  try {
    if (PaperPilotInstance && typeof PaperPilotInstance.destroy === "function") {
      PaperPilotInstance.destroy(data);
      PaperPilotInstance = undefined;
    }
  } catch (err) {
    dump("[PaperPilot] Error during shutdown: " + err + "\n");
  }
}

function uninstall(data, reason) {}
