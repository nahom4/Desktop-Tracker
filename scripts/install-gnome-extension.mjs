#!/usr/bin/env node
/**
 * Install (and try to enable) the Desktop Tracker GNOME Shell extension.
 *
 * Under Wayland, GNOME isolates clients from one another: there is no
 * _NET_ACTIVE_WINDOW to read and org.gnome.Shell.Eval is disabled outside
 * developer mode. Only shell-side code can see which window has focus, so the
 * collector needs this extension to track anything at all.
 *
 * Usage:
 *   node scripts/install-gnome-extension.mjs            # install + enable
 *   node scripts/install-gnome-extension.mjs --uninstall
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UUID = "desktop-tracker@nahom4.github.io";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(__dirname, "../apps/gnome-extension", UUID);

/**
 * Where GNOME Shell looks for per-user extensions.
 *
 * Snaps rewrite XDG_DATA_HOME to a private directory inside the sandbox
 * (~/snap/<app>/<rev>/.local/share), so running this from a snap-confined
 * terminal — VS Code's, for instance — would install somewhere GNOME never
 * reads. The shell itself is never confined, so fall back to the real home.
 */
function extensionsDir() {
  const xdg = process.env.XDG_DATA_HOME;
  const real = path.join(os.homedir(), ".local", "share");
  if (!xdg || process.env.SNAP || xdg.includes(`${path.sep}snap${path.sep}`)) {
    return real;
  }
  return xdg;
}

const target = path.join(extensionsDir(), "gnome-shell", "extensions", UUID);

function run(cmd, args) {
  try {
    return {
      ok: true,
      out: execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
    };
  } catch (e) {
    return { ok: false, out: String(e.stderr || e.message || e) };
  }
}

if (process.platform !== "linux") {
  console.log("[gnome-ext] not Linux — nothing to do.");
  process.exit(0);
}

if (process.argv.includes("--uninstall")) {
  run("gnome-extensions", ["disable", UUID]);
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`[gnome-ext] removed ${target}`);
  console.log("[gnome-ext] log out and back in to finish removing it.");
  process.exit(0);
}

if (!fs.existsSync(source)) {
  console.error(`[gnome-ext] extension source not found at ${source}`);
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(source, target, { recursive: true });
console.log(`[gnome-ext] installed to ${target}`);

const enable = run("gnome-extensions", ["enable", UUID]);
if (enable.ok) {
  console.log(`[gnome-ext] enabled ${UUID}`);
} else {
  console.warn(`[gnome-ext] could not enable automatically: ${enable.out.trim()}`);
  console.warn(`[gnome-ext] enable it by hand with: gnome-extensions enable ${UUID}`);
}

// A running GNOME Shell will not pick up a newly installed extension on
// Wayland — it cannot restart itself without dropping every window.
const sessionType = process.env.XDG_SESSION_TYPE || "";
if (sessionType.toLowerCase() === "wayland") {
  console.log("");
  console.log("  Log out and back in to load the extension (Wayland cannot");
  console.log("  restart GNOME Shell in place). Then verify with:");
  console.log("");
  console.log("    gnome-extensions info " + UUID);
  console.log("");
} else {
  console.log("Restart GNOME Shell (Alt+F2, type 'r', Enter) to load it.");
}
