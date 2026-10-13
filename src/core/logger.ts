/**
 * PaperPilot Unified Debug Logger
 */
/* global Zotero, dump */

export function debugFileLog(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  dump(line + "\n");
  try {
    if (typeof Zotero !== "undefined" && typeof (Zotero as any).debug === "function") {
      (Zotero as any).debug(`[PaperPilot] ${msg}`);
    }
  } catch (e) {}
}
