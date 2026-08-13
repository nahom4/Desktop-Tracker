// Dev driver for the Electron main process.
// - Bundles main + preload with esbuild in watch mode.
// - Waits for the Vite renderer to be reachable.
// - Launches Electron once; debounced relaunch kills the full process tree on Windows.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import waitOn from "wait-on";

const require = createRequire(import.meta.url);
const electronPath = require("electron");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const mainEntry = path.join(root, "dist/main/index.cjs");

const EXTERNAL = ["electron", "better-sqlite3"];

let electronProc = null;
let rendererWaitDone = false;
let launchInFlight = false;
let relaunchQueued = false;
let relaunchTimer = null;

function killElectronTree() {
  return new Promise((resolve) => {
    if (!electronProc?.pid) {
      electronProc = null;
      resolve();
      return;
    }
    const pid = electronProc.pid;
    electronProc = null;

    if (process.platform === "win32") {
      const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        shell: true,
        stdio: "ignore",
      });
      killer.on("close", () => setTimeout(resolve, 400));
      killer.on("error", () => resolve());
      return;
    }

    try {
      process.kill(pid, "SIGTERM");
    } catch {}
    setTimeout(resolve, 400);
  });
}

async function launchElectronNow() {
  if (!existsSync(mainEntry)) {
    console.error("[dev-main] main entry not built yet:", mainEntry);
    return;
  }

  await killElectronTree();

  console.log("[dev-main] launching electron");

  // VS Code's integrated terminal exports ELECTRON_RUN_AS_NODE=1 for its own
  // helper processes, and it leaks into anything launched from there. Inherited,
  // it makes our Electron binary boot as plain Node — `require("electron")` then
  // returns a stub whose `app` is undefined and startup dies on the first line.
  const env = { ...process.env, VITE_DEV_SERVER_URL: "http://localhost:5173" };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ATTACH_CONSOLE;

  electronProc = spawn(electronPath, ["."], {
    cwd: root,
    stdio: "inherit",
    env,
  });

  electronProc.on("exit", (code, signal) => {
    console.log(`[dev-main] electron exited (code=${code} signal=${signal ?? ""})`);
    electronProc = null;
  });
}

function scheduleLaunch() {
  if (relaunchTimer) clearTimeout(relaunchTimer);
  relaunchTimer = setTimeout(() => {
    relaunchTimer = null;
    void runLaunchPipeline();
  }, 500);
}

async function runLaunchPipeline() {
  if (launchInFlight) {
    relaunchQueued = true;
    return;
  }
  launchInFlight = true;
  try {
    if (!rendererWaitDone) {
      console.log("[dev-main] waiting for Vite on :5173");
      await waitOn({ resources: ["http://localhost:5173"], timeout: 60_000 });
      rendererWaitDone = true;
    }
    await launchElectronNow();
  } catch (e) {
    console.error("[dev-main] launch failed:", e instanceof Error ? e.message : e);
  } finally {
    launchInFlight = false;
    if (relaunchQueued) {
      relaunchQueued = false;
      scheduleLaunch();
    }
  }
}

const rebuildPlugin = {
  name: "rebuild-electron",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) {
        console.error(`[dev-main] build had ${result.errors.length} error(s)`);
        return;
      }
      console.log("[dev-main] build ok, scheduling electron launch");
      scheduleLaunch();
    });
  },
};

/** @type {esbuild.BuildOptions} */
const baseOptions = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  logLevel: "info",
  external: EXTERNAL,
};

const mainCtx = await esbuild.context({
  ...baseOptions,
  entryPoints: [path.join(root, "src/main/index.ts")],
  outfile: mainEntry,
  plugins: [rebuildPlugin],
});

const preloadCtx = await esbuild.context({
  ...baseOptions,
  entryPoints: [path.join(root, "src/preload/index.ts")],
  outfile: path.join(root, "dist/preload/index.cjs"),
});

await Promise.all([mainCtx.watch(), preloadCtx.watch()]);
console.log("[dev-main] watching main + preload");

process.on("SIGINT", () => {
  void killElectronTree().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void killElectronTree().finally(() => process.exit(0));
});
