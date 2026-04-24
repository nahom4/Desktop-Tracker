import type { ExportFormat } from "@desktop-tracker/shared";
import { api } from "./api";

/**
 * Toggle the global `is-printing` class on <html>, give the browser two
 * paint frames to reflow without the sidebar/chrome, then invoke the
 * main-process export. Always cleared in `finally` so a cancelled save
 * dialog or thrown error still restores the UI.
 */
export async function exportCurrentView(
  format: ExportFormat,
  suggestedName: string
): Promise<void> {
  const root = document.documentElement;
  root.classList.add("is-printing");
  try {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
    const res = await api.exportActive({ format, suggestedName });
    if (!res.saved && res.reason && res.reason !== "User cancelled.") {
      console.warn("[export] not saved:", res.reason);
    }
  } finally {
    root.classList.remove("is-printing");
  }
}
