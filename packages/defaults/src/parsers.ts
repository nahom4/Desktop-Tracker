/**
 * Title parsers extract a "project" identifier from a window title for apps
 * whose titles carry structured info. Each parser receives (exe, title) and
 * returns the project string or null.
 */

export type TitleParser = (exe: string, title: string) => string | null;

const VSCODE_EXES = new Set(["code.exe", "code - insiders.exe", "cursor.exe", "windsurf.exe"]);

/** VSCode / Cursor / Windsurf: `<file> - <folder> - <App Name>`. We want <folder>. */
const vscodeParser: TitleParser = (exe, title) => {
  if (!VSCODE_EXES.has(exe.toLowerCase())) return null;
  const parts = title.split(" - ");
  if (parts.length < 2) return null;
  // The last part is the app name. The second-to-last is the workspace folder.
  return parts[parts.length - 2]?.trim() || null;
};

/** JetBrains IDEs: `<file> - <project> [- branch] - <IDE>` or just `<project> - <IDE>`. */
const jetbrainsParser: TitleParser = (exe, title) => {
  if (!/^(idea|pycharm|webstorm|goland|rustrover|clion|rider|androidstudio)64?\.exe$/i.test(exe)) return null;
  const parts = title.split(" - ");
  if (parts.length < 2) return null;
  return parts[parts.length - 2]?.trim() || null;
};

/** Visual Studio: `<file> - <Solution> - Microsoft Visual Studio`. */
const visualStudioParser: TitleParser = (exe, title) => {
  if (exe.toLowerCase() !== "devenv.exe") return null;
  const m = title.match(/^(?:.* - )?(.+?)\s+-\s+Microsoft Visual Studio/);
  return m?.[1]?.trim() ?? null;
};

/** Figma desktop: `<File> – Figma` (em dash). */
const figmaParser: TitleParser = (exe, title) => {
  if (exe.toLowerCase() !== "figma.exe") return null;
  const m = title.match(/^(.+?)\s+[–-]\s+Figma$/);
  return m?.[1]?.trim() ?? null;
};

/** Slack: `<Channel> - <Workspace> - Slack`. We use `<Workspace>` as the "project". */
const slackParser: TitleParser = (exe, title) => {
  if (exe.toLowerCase() !== "slack.exe") return null;
  const parts = title.split(" - ");
  if (parts.length < 3) return null;
  return parts[parts.length - 2]?.trim() || null;
};

/** Discord: `#<channel> | <Server> - Discord` */
const discordParser: TitleParser = (exe, title) => {
  if (exe.toLowerCase() !== "discord.exe") return null;
  const m = title.match(/\|\s*(.+?)\s+-\s+Discord$/);
  return m?.[1]?.trim() ?? null;
};

/** Obsidian: `<note> - <vault> - Obsidian v…` */
const obsidianParser: TitleParser = (exe, title) => {
  if (exe.toLowerCase() !== "obsidian.exe") return null;
  const parts = title.split(" - ");
  if (parts.length < 3) return null;
  return parts[parts.length - 2]?.trim() || null;
};

export const DEFAULT_TITLE_PARSERS: TitleParser[] = [
  vscodeParser,
  jetbrainsParser,
  visualStudioParser,
  figmaParser,
  slackParser,
  discordParser,
  obsidianParser,
];

/** Run all parsers in order; first non-null wins. */
export function extractProject(exe: string, title: string | null | undefined): string | null {
  if (!title) return null;
  for (const p of DEFAULT_TITLE_PARSERS) {
    const r = p(exe, title);
    if (r) return r;
  }
  return null;
}
