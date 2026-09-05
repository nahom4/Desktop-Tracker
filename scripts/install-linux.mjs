#!/usr/bin/env node
/**
 * Install Desktop Tracker into the current user's home — no root required.
 *
 * A .deb needs sudo and an AppImage needs libfuse2, neither of which is a safe
 * assumption. Instead this copies electron-builder's unpacked output to
 * ~/.local/opt and registers a launcher, which works on any desktop and is
 * removed by deleting two directories.
 *
 * Autostart is not written here: the app registers itself at first launch
 * (see syncAutoLaunch in src/main/index.ts), so the login entry always points
 * at whatever binary actually ran.
 *
 * Usage:
 *   node scripts/install-linux.mjs              # build, then install
 *   node scripts/install-linux.mjs --no-build   # install the existing build
 *   node scripts/install-linux.mjs --uninstall
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, "..");
const desktopApp = path.join(repo, "apps/desktop");

const APP_ID = "desktop-tracker";
const HOME = os.homedir();

/**
 * Snaps rewrite XDG_* to sandbox-private paths, so a run from a snap-confined
 * terminal (VS Code's, for one) would install where the desktop never looks.
 */
function userDir(envVar, fallback) {
  const v = process.env[envVar];
  const real = path.join(HOME, fallback);
  if (!v || process.env.SNAP || v.includes(`${path.sep}snap${path.sep}`)) return real;
  return v;
}

const dataHome = userDir("XDG_DATA_HOME", ".local/share");
const configHome = userDir("XDG_CONFIG_HOME", ".config");

const installDir = path.join(HOME, ".local", "opt", APP_ID);
const binLink = path.join(HOME, ".local", "bin", APP_ID);
const launcher = path.join(dataHome, "applications", `${APP_ID}.desktop`);
const iconTarget = path.join(dataHome, "icons/hicolor/512x512/apps", `${APP_ID}.png`);
const autostart = path.join(configHome, "autostart", `${APP_ID}.desktop`);

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: "inherit", ...opts });
}
function tryRun(cmd, args) {
  try {
    execFileSync(cmd, args, { stdio: "ignore" });
  } catch {
    /* optional desktop-integration helpers; absent on minimal systems */
  }
}

if (process.platform !== "linux") {
  console.error("[install] this installer is for Linux only.");
  process.exit(1);
}

if (process.argv.includes("--uninstall")) {
  for (const p of [installDir, launcher, iconTarget, autostart, binLink]) {
    fs.rmSync(p, { recursive: true, force: true });
    console.log(`[install] removed ${p}`);
  }
  tryRun("update-desktop-database", [path.join(dataHome, "applications")]);
  console.log("[install] uninstalled. Your data in ~/.config/Desktop Tracker was kept.");
  process.exit(0);
}

// 1. Build unless told otherwise.
if (!process.argv.includes("--no-build")) {
  console.log("[install] building renderer + main…");
  run("npm", ["run", "build"], { cwd: repo });
  console.log("[install] packaging…");
  run("npx", ["electron-builder", "--linux", "dir"], { cwd: desktopApp });
}

const unpacked = path.join(desktopApp, "release/linux-unpacked");
const binary = path.join(unpacked, APP_ID);
if (!fs.existsSync(binary)) {
  console.error(`[install] packaged binary missing at ${binary}. Run without --no-build.`);
  process.exit(1);
}

// 2. Copy the app into place. Replacing the directory wholesale avoids leaving
//    stale files from a previous version behind.
console.log("[install] installing to " + installDir);
fs.rmSync(installDir, { recursive: true, force: true });
fs.mkdirSync(path.dirname(installDir), { recursive: true });
fs.cpSync(unpacked, installDir, { recursive: true });

// 3. Icon.
const iconSource = path.join(desktopApp, "build/icon.png");
if (fs.existsSync(iconSource)) {
  fs.mkdirSync(path.dirname(iconTarget), { recursive: true });
  fs.copyFileSync(iconSource, iconTarget);
}

// 4. Launcher.
const exec = path.join(installDir, APP_ID);
fs.mkdirSync(path.dirname(launcher), { recursive: true });
fs.writeFileSync(
  launcher,
  [
    "[Desktop Entry]",
    "Type=Application",
    "Version=1.0",
    "Name=Desktop Tracker",
    "GenericName=Activity Tracker",
    "Comment=Local-first desktop activity tracker with a weekly plan",
    `Exec="${exec}" %U`,
    `Icon=${APP_ID}`,
    "Terminal=false",
    "Categories=Utility;",
    "Keywords=productivity;time;tracking;focus;schedule;",
    // Lets the shell match the running window to this launcher.
    `StartupWMClass=${APP_ID}`,
    "StartupNotify=true",
    "",
  ].join("\n"),
  { mode: 0o644 }
);

// 5. CLI convenience symlink.
fs.mkdirSync(path.dirname(binLink), { recursive: true });
fs.rmSync(binLink, { force: true });
fs.symlinkSync(exec, binLink);

tryRun("update-desktop-database", [path.join(dataHome, "applications")]);
tryRun("gtk-update-icon-cache", ["-f", "-t", path.join(dataHome, "icons/hicolor")]);

// 6. Chromium refuses to start when its SUID helper exists but is not
//    root-owned mode 4755 — it aborts before any of our code runs, so the app
//    silently never appears. A .deb does this in its postinst; a copy into
//    ~/.local/opt has to do it here. Needs one sudo prompt.
//
//    Deliberately last: everything above is already in place, so if the
//    password is declined the only thing left is the one command printed here.
const chromeSandbox = path.join(installDir, "chrome-sandbox");
let sandboxOk = true;
if (fs.existsSync(chromeSandbox)) {
  try {
    run("sudo", ["chown", "root:root", chromeSandbox]);
    run("sudo", ["chmod", "4755", chromeSandbox]);
    console.log("[install] chrome-sandbox set to root:root 4755");
  } catch {
    sandboxOk = false;
    console.error(
      `\n[install] could not set the SUID sandbox on chrome-sandbox.\n` +
        "[install] THE APP WILL NOT START until you run:\n\n" +
        `    sudo chown root:root ${chromeSandbox} \\\n` +
        `      && sudo chmod 4755 ${chromeSandbox}\n`,
    );
  }
}

console.log(`
[install] done${sandboxOk ? "" : " (except the sandbox step above)"}.

  launch      ${APP_ID}   (or "Desktop Tracker" in your apps)
  installed   ${installDir}
  data        ~/.config/Desktop Tracker/data.sqlite

The app writes its own login entry on first run; check it with
  cat ${autostart}
`);
