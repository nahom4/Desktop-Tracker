import { Tray, Menu, nativeImage, app } from "electron";
import path from "node:path";

let tray: Tray | null = null;

export function createTray(onOpen: () => void): Tray {
  // Placeholder transparent 16x16 image so the tray icon exists; replace with
  // a real PNG in build/icon.ico for the packaged build.
  const empty = nativeImage.createEmpty();
  tray = new Tray(empty);
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
