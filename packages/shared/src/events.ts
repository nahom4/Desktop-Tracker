/**
 * Wire format emitted by the Rust collector, one JSON object per line on stdout.
 * Keep this in lockstep with apps/collector/src/types.rs.
 */
export interface CollectorHeartbeat {
  ts: number;
  type: "heartbeat";
  app: CollectorAppInfo;
  browser: CollectorBrowserInfo | null;
  idle_ms: number;
  locked: boolean;
}

export interface CollectorAppInfo {
  exe: string;
  exe_path: string | null;
  pid: number;
  title: string;
}

export interface CollectorBrowserInfo {
  url: string;
  domain: string;
  profile: string | null;
  incognito: boolean;
}

/**
 * Persisted event row in SQLite. A session = a contiguous span where (exe,
 * coalesced title, url, idle, locked) was stable.
 */
export interface ActivityEvent {
  id: number;
  startTs: number;
  endTs: number;
  durationMs: number;
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

export type NewActivityEvent = Omit<ActivityEvent, "id">;
