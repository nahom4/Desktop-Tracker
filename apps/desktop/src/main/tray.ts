import { Tray, Menu, nativeImage, app } from "electron";
import path from "node:path";

/**
 * Tray icon.
 *
 * This must be a real raster file: `nativeImage` decodes PNG and JPEG only, so
 * an SVG data URL silently produces an empty 0x0 image — which yields a tray
 * entry that exists and responds to clicks but paints nothing at all. Reuse the
 * app icon and let the panel scale it.
 */
const ICON_PATH = path.join(__dirname, "../../build/icon.png");

/** Panel height GNOME/AppIndicator expects; larger icons get clipped. */
const TRAY_ICON_SIZE = 22;

let tray: Tray | null = null;

export function createTray(onOpen: () => void): Tray {
  const source = nativeImage.createFromPath(ICON_PATH);
  if (source.isEmpty()) {
    // Caller treats a throw as "no tray available" and opens the dashboard
    // instead, so a missing icon never leaves the app unreachable.
    throw new Error(`tray icon could not be loaded from ${ICON_PATH}`);
  }
  const icon = source.resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE });

  tray = new Tray(icon);
  tray.setToolTip("Desktop Tracker");

  const menu = Menu.buildFromTemplate([
    { label: "Open dashboard", click: () => onOpen() },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on("click", () => onOpen());

  return tray;
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
