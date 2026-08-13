/**
 * Theme + text size, applied to <html> and remembered locally.
 *
 * Kept in localStorage rather than the SQLite settings table on purpose: this
 * has to be applied before the first paint, and a round trip through IPC would
 * show a flash of the wrong theme on every launch.
 */

export type Theme = "system" | "light" | "dark";
export type TextSize = "small" | "default" | "large";

const THEME_KEY = "dt.theme";
const SIZE_KEY = "dt.textSize";

/** Root font size per step — the whole UI is rem-based, so this scales it all. */
const SIZE_PX: Record<TextSize, string> = {
  small: "15px",
  default: "17px",
  large: "19px",
};

export function getTheme(): Theme {
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

export function getTextSize(): TextSize {
  const v = localStorage.getItem(SIZE_KEY);
  return v === "small" || v === "large" ? v : "default";
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme);
  applyAppearance();
}

export function setTextSize(size: TextSize): void {
  localStorage.setItem(SIZE_KEY, size);
  applyAppearance();
}

/**
 * Push the stored preferences onto <html>. "system" removes the attribute
 * entirely so the CSS `prefers-color-scheme` branch takes over.
 */
export function applyAppearance(): void {
  const root = document.documentElement;
  const theme = getTheme();
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  root.style.setProperty("--ui-root-size", SIZE_PX[getTextSize()]);
}
