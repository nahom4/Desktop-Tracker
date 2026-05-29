import { Tray, Menu, nativeImage, app } from "electron";

let tray: Tray | null = null;

export function createTray(onOpen: () => void): Tray {
  const icon = nativeImage.createFromDataURL(
    "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#0f172a"/>
          <path d="M8 20h16v3H8zM8 14h11v3H8zM8 8h16v3H8z" fill="#38bdf8"/>
        </svg>`
      )
  );
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
