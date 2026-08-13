import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { app } from "electron";
import type { CollectorHeartbeat } from "@desktop-tracker/shared";

interface BridgeOptions {
  onHeartbeat: (hb: CollectorHeartbeat) => void;
  onError?: (err: Error) => void;
}

let proc: ChildProcess | null = null;
let opts: BridgeOptions | null = null;
let restartTimer: NodeJS.Timeout | null = null;

/** Cargo appends `.exe` only on Windows. */
const COLLECTOR_BIN =
  process.platform === "win32"
    ? "desktop-tracker-collector.exe"
    : "desktop-tracker-collector";

function resolveCollectorPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "collector", COLLECTOR_BIN);
  }

  const collectorDir = path.resolve(__dirname, "../../../../apps/collector");
  const exeName = COLLECTOR_BIN;

  // 1. Repo-local target dir (the conventional path).
  const local = path.join(collectorDir, "target", "release", exeName);
  if (existsSync(local)) return local;

  // 2. Honour CARGO_TARGET_DIR (set by some sandboxed environments).
  const targetDirEnv = process.env.CARGO_TARGET_DIR;
  if (targetDirEnv) {
    const fromEnv = path.join(targetDirEnv, "release", exeName);
    if (existsSync(fromEnv)) return fromEnv;
  }

  // 3. Default to the local path; the existsSync check downstream will report
  //    a clean "build the collector first" error.
  return local;
}

export function startCollector(o: BridgeOptions): void {
  opts = o;
  spawnCollector();
}

function spawnCollector(): void {
  const exe = resolveCollectorPath();
  if (!existsSync(exe)) {
    const err = new Error(
      `Collector binary not found at ${exe}. Run "npm run collector:build" first.`
    );
    console.error("[collector-bridge]", err.message);
    opts?.onError?.(err);
    // Try again in 5s; the dev loop may be building it right now.
    restartTimer = setTimeout(spawnCollector, 5000);
    return;
  }

  console.log(`[collector-bridge] spawning ${exe}`);
  const child = spawn(exe, [], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  proc = child;

  if (child.stdout) {
    const rl = readline.createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      if (!line) return;
      try {
        const hb = JSON.parse(line) as CollectorHeartbeat;
        if (hb && hb.type === "heartbeat") opts?.onHeartbeat(hb);
      } catch {
        console.warn("[collector-bridge] bad line:", line.slice(0, 200));
      }
    });
  }

  if (child.stderr) {
    child.stderr.on("data", (d) => {
      process.stderr.write(`[collector] ${d}`);
    });
  }

  child.on("exit", (code, signal) => {
    console.warn(`[collector-bridge] exited code=${code} signal=${signal}`);
    if (proc === child) proc = null;
    if (opts) {
      restartTimer = setTimeout(spawnCollector, 2000);
    }
  });
  child.on("error", (e) => {
    console.error("[collector-bridge] spawn error:", e);
    opts?.onError?.(e);
  });
}

export function stopCollector(): void {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  opts = null;
  if (proc) {
    proc.kill();
    proc = null;
  }
}
