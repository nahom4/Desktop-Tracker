/**
 * Report export: render the active main window to PNG or PDF and prompt the
 * user for a save location. The renderer is expected to toggle the
 * `is-printing` CSS class before invoking these so the chrome (sidebar etc.)
 * is hidden in the output.
 */

import { app, BrowserWindow, dialog } from "electron";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExportRequest, ExportResult } from "@desktop-tracker/shared";

export async function exportActiveWindow(req: ExportRequest): Promise<ExportResult> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (!win || win.isDestroyed()) {
    return { saved: false, reason: "No window to export." };
  }

  const ext = req.format;
  const defaultPath = path.join(
    app.getPath("documents"),
    `${req.suggestedName}.${ext}`
  );

  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: `Export as ${ext.toUpperCase()}`,
    defaultPath,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (canceled || !filePath) {
    return { saved: false, reason: "User cancelled." };
  }

  const buffer = req.format === "pdf"
    ? await renderPdf(win)
    : await renderPng(win);

  await writeFile(filePath, buffer);
  return { saved: true, path: filePath };
}

async function renderPdf(win: BrowserWindow): Promise<Buffer> {
  return win.webContents.printToPDF({
    pageSize: "A4",
    landscape: true,
    printBackground: true,
    margins: { top: 0.2, bottom: 0.2, left: 0.2, right: 0.2 },
  });
}

async function renderPng(win: BrowserWindow): Promise<Buffer> {
  const image = await win.webContents.capturePage();
  return image.toPNG();
}
