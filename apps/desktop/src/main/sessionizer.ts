import type { CollectorHeartbeat, NewActivityEvent } from "@desktop-tracker/shared";
import { parseDomain, extractProject } from "@desktop-tracker/defaults";
import { insertEvent } from "./db";
import { scheduleFastClassification } from "./ai-classifier";

/** ms-of-idle considered "idle" for sessionization. */
const IDLE_THRESHOLD_MS = 60_000;
/** If two consecutive heartbeats are this far apart, force a session close (sleep/hibernate). */
const HEARTBEAT_GAP_MAX_MS = 5_000;

interface Session {
  startTs: number;
  endTs: number;
  exe: string;
  exePath: string | null;
  title: string | null;
  url: string | null;
  domain: string | null;
  browserProfile: string | null;
  project: string | null;
  isIdle: boolean;
  isLocked: boolean;
}

export class Sessionizer {
  private current: Session | null = null;
  private lastHeartbeatTs = 0;

  onHeartbeat(hb: CollectorHeartbeat): void {
    const next = this.toSessionShape(hb);

    // Gap detection: a long gap means the parent process was paused (sleep,
    // hibernation, etc). Close the current session at its last known end_ts
    // rather than extending it across the gap.
    if (
      this.lastHeartbeatTs > 0 &&
      hb.ts - this.lastHeartbeatTs > HEARTBEAT_GAP_MAX_MS
    ) {
      this.flush();
    }
    this.lastHeartbeatTs = hb.ts;

    if (!this.current) {
      this.current = { ...next, startTs: hb.ts, endTs: hb.ts };
      return;
    }

    if (this.isSameSession(this.current, next)) {
      this.current.endTs = hb.ts;
      return;
    }

    this.flush();
    this.current = { ...next, startTs: hb.ts, endTs: hb.ts };
  }

  flush(): void {
    if (!this.current) return;
    const duration = this.current.endTs - this.current.startTs;
    if (duration <= 0) {
      this.current = null;
      return;
    }
    const ev: NewActivityEvent = {
      startTs: this.current.startTs,
      endTs: this.current.endTs,
      durationMs: duration,
      exe: this.current.exe,
      exePath: this.current.exePath,
      title: this.current.title,
      url: this.current.url,
      domain: this.current.domain,
      browserProfile: this.current.browserProfile,
      project: this.current.project,
      isIdle: this.current.isIdle,
      isLocked: this.current.isLocked,
    };
    try {
      insertEvent(ev);
      if (
        !ev.isIdle &&
        !ev.isLocked &&
        ev.domain &&
        (ev.title || ev.url)
      ) {
        scheduleFastClassification();
      }
    } catch (e) {
      console.error("[sessionizer] insert failed", e);
    }
    this.current = null;
  }

  private toSessionShape(hb: CollectorHeartbeat): Omit<Session, "startTs" | "endTs"> {
    const idle = hb.idle_ms >= IDLE_THRESHOLD_MS;
    const locked = hb.locked;
    const app = hb.app;

    if (!app) {
      return {
        exe: "(idle)",
        exePath: null,
        title: null,
        url: null,
        domain: null,
        browserProfile: null,
        project: null,
        isIdle: true,
        isLocked: locked,
      };
    }

    const url = hb.browser?.url ?? null;
    const domain = hb.browser?.domain || (url ? parseDomain(url) : null);
    const project = extractProject(app.exe, app.title) ?? null;

    return {
      exe: app.exe,
      exePath: app.exe_path,
      title: app.title,
      url,
      domain,
      browserProfile: hb.browser?.profile ?? null,
      project,
      isIdle: idle,
      isLocked: locked,
    };
  }

  private isSameSession(
    a: Omit<Session, "startTs" | "endTs">,
    b: Omit<Session, "startTs" | "endTs">
  ): boolean {
    return (
      a.exe === b.exe &&
      a.title === b.title &&
      a.url === b.url &&
      a.browserProfile === b.browserProfile &&
      a.isIdle === b.isIdle &&
      a.isLocked === b.isLocked
    );
  }
}
