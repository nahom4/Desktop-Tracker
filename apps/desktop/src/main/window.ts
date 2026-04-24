import { BrowserWindow } from "electron";
import path from "node:path";

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

export interface MainWindowOptions {
  /** When true, show (and focus) the window once the renderer is ready. */
  showOnReady?: boolean;
}

export function createMainWindow(opts: MainWindowOptions = {}): BrowserWindow {
  const { showOnReady = false } = opts;
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0b0d10",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  if (showOnReady) {
    win.once("ready-to-show", () => {
      win.show();
      win.focus();
    });
  }

  if (VITE_DEV_SERVER_URL) {
    void win.loadURL(VITE_DEV_SERVER_URL);
    if (showOnReady) {
      win.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  return win;
}
