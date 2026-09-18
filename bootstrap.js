/**
 * Zotero 7-10 Add-on Lifecycle Bootstrap
 */
/* global ChromeUtils */

var PaperPilotInstance;

function install(data, reason) {
  // Add-on installed
}

function startup(data, reason) {
  const rootURI = data.rootURI || data.resourceURI.spec;
  try {
    const module = ChromeUtils.importESModule(rootURI + "addon/index.js");
    PaperPilotInstance = module.PaperPilot;
    if (PaperPilotInstance && typeof PaperPilotInstance.init === "function") {
      PaperPilotInstance.init(data);
    }
  } catch (err) {
    dump("[PaperPilot] Failed to initialize plugin: " + err + "\n");
    if (typeof Components !== "undefined") {
      Components.utils.reportError(err);
    }
  }
}

function shutdown(data, reason) {
  try {
    if (PaperPilotInstance && typeof PaperPilotInstance.destroy === "function") {
      PaperPilotInstance.destroy(data);
      PaperPilotInstance = undefined;
    }
  } catch (err) {
    dump("[PaperPilot] Error during shutdown: " + err + "\n");
  }
}

function uninstall(data, reason) {
  // Add-on uninstalled
}
