import { BrowserWindow, Menu, MenuItem } from "electron";
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
      // Chromium's built-in spellchecker, for the notes editor.
      spellcheck: true,
    },
  });

  win.webContents.session.setSpellCheckerLanguages(["en-US"]);
  attachSpellCheckMenu(win);

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

/**
 * Right-click menu for the notes editor.
 *
 * Chromium underlines misspellings on its own, but the corrections only become
 * usable through a context menu — without this the squiggles are decoration.
 * Also carries cut/copy/paste, which an app with `autoHideMenuBar` otherwise
 * leaves to keyboard shortcuts alone.
 */
function attachSpellCheckMenu(win: BrowserWindow): void {
  win.webContents.on("context-menu", (_event, params) => {
    const menu = new Menu();

    for (const suggestion of params.dictionarySuggestions) {
      menu.append(
        new MenuItem({
          label: suggestion,
          click: () => win.webContents.replaceMisspelling(suggestion),
        })
      );
    }

    if (params.misspelledWord) {
      if (params.dictionarySuggestions.length > 0) {
        menu.append(new MenuItem({ type: "separator" }));
      }
      menu.append(
        new MenuItem({
          label: "Add to dictionary",
          click: () =>
            win.webContents.session.addWordToSpellCheckerDictionary(
              params.misspelledWord
            ),
        })
      );
      menu.append(new MenuItem({ type: "separator" }));
    }

    if (params.isEditable) {
      menu.append(new MenuItem({ role: "cut", enabled: params.editFlags.canCut }));
      menu.append(new MenuItem({ role: "copy", enabled: params.editFlags.canCopy }));
      menu.append(new MenuItem({ role: "paste", enabled: params.editFlags.canPaste }));
      menu.append(new MenuItem({ role: "selectAll" }));
    } else if (params.selectionText) {
      menu.append(new MenuItem({ role: "copy" }));
    }

    if (menu.items.length > 0) menu.popup({ window: win });
  });
}
