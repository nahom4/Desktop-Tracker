/**
 * Free port 5173 before `npm run dev`.
 * Orphaned Vite from a crashed session blocks the renderer and leaves Electron half-running.
 */
import { execSync } from "node:child_process";

function killPortWindows(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const pids = new Set();
    for (const line of out.split("\n")) {
      if (!line.includes("LISTENING")) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid) && pid !== "0") pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
        console.log(`[kill-stale-dev] freed port ${port} (pid ${pid})`);
      } catch {}
    }
  } catch {}
}

function killPortUnix(port) {
  try {
    execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, {
      stdio: "ignore",
      shell: true,
    });
  } catch {}
}

if (process.platform === "win32") {
  killPortWindows(5173);
} else {
  killPortUnix(5173);
}
