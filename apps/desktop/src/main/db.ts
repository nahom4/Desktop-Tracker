import Database from "better-sqlite3";
import type {
  ActivityEvent,
  AiReview,
  Category,
  CategoryPatch,
  CategoryRule,
  EventTag,
  NewActivityEvent,
  NewCategory,
  NewCategoryRule,
  NewEventTag,
  NewPlanNote,
  NewScheduleBlock,
  NewScheduleOverride,
  NotificationLogEntry,
  PersistedReportRef,
  PlanNote,
  ScheduleBlock,
  ScheduleBlockPatch,
  ScheduleOverride,
} from "@desktop-tracker/shared";
import {
  DEFAULT_APP_RULES,
  DEFAULT_CATEGORIES,
  DEFAULT_DOMAIN_RULES,
} from "@desktop-tracker/defaults";

let db: Database.Database | null = null;

export function openDb(filePath: string): Database.Database {
  db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export function getDb(): Database.Database {
  if (!db) throw new Error("DB not open");
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id              INTEGER PRIMARY KEY,
      start_ts        INTEGER NOT NULL,
      end_ts          INTEGER NOT NULL,
      duration_ms     INTEGER NOT NULL,
      exe             TEXT NOT NULL,
      exe_path        TEXT,
      title           TEXT,
      url             TEXT,
      domain          TEXT,
      browser_profile TEXT,
      project         TEXT,
      is_idle         INTEGER NOT NULL DEFAULT 0,
      is_locked       INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_events_time ON events(start_ts, end_ts);
    CREATE INDEX IF NOT EXISTS idx_events_exe ON events(exe);
    CREATE INDEX IF NOT EXISTS idx_events_domain ON events(domain);

    CREATE TABLE IF NOT EXISTS category_rules (
      id          INTEGER PRIMARY KEY,
      match_type  TEXT NOT NULL,
      pattern     TEXT NOT NULL,
      category    TEXT NOT NULL,
      weight      REAL NOT NULL,
      priority    INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS reports (
      id            INTEGER PRIMARY KEY,
      kind          TEXT NOT NULL,
      period_start  INTEGER NOT NULL,
      period_end    INTEGER NOT NULL,
      payload       TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reports_period ON reports(kind, period_start);

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- v0.6 — AI insights
    CREATE TABLE IF NOT EXISTS categories (
      id                   INTEGER PRIMARY KEY,
      name                 TEXT UNIQUE NOT NULL,
      description          TEXT NOT NULL DEFAULT '',
      color                TEXT NOT NULL DEFAULT '#64748b',
      weight               REAL NOT NULL DEFAULT 0,
      is_default           INTEGER NOT NULL DEFAULT 0,
      is_health_tracked    INTEGER NOT NULL DEFAULT 0,
      target_min_per_day   INTEGER,
      target_min_per_week  INTEGER,
      created_at           INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS event_tags (
      id          INTEGER PRIMARY KEY,
      event_id    INTEGER NOT NULL,
      category    TEXT NOT NULL,
      source      TEXT NOT NULL CHECK (source IN ('rule','ai','manual')),
      confidence  REAL,
      model       TEXT,
      created_at  INTEGER NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_event_tags_event ON event_tags(event_id);
    CREATE INDEX IF NOT EXISTS idx_event_tags_category ON event_tags(category);
    CREATE INDEX IF NOT EXISTS idx_event_tags_source ON event_tags(source);

    -- v0.7 — notifications + AI review audit
    CREATE TABLE IF NOT EXISTS notification_log (
      id          INTEGER PRIMARY KEY,
      ts          INTEGER NOT NULL,
      kind        TEXT NOT NULL,
      channel     TEXT NOT NULL,
      title       TEXT NOT NULL,
      body        TEXT NOT NULL,
      meta        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_notification_log_ts ON notification_log(ts);
    CREATE INDEX IF NOT EXISTS idx_notification_log_kind ON notification_log(kind, ts);

    -- v0.8 — weekly schedule (recurring plan + dated exceptions)
    CREATE TABLE IF NOT EXISTS schedule_blocks (
      id           INTEGER PRIMARY KEY,
      day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      start_min    INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
      end_min      INTEGER NOT NULL CHECK (end_min BETWEEN 1 AND 1440),
      title        TEXT NOT NULL,
      category     TEXT NOT NULL,
      is_primary   INTEGER NOT NULL DEFAULT 0,
      notes        TEXT,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL,
      CHECK (end_min > start_min)
    );
    CREATE INDEX IF NOT EXISTS idx_schedule_blocks_day
      ON schedule_blocks(day_of_week, start_min);

    CREATE TABLE IF NOT EXISTS schedule_overrides (
      id          INTEGER PRIMARY KEY,
      date        TEXT NOT NULL,
      block_id    INTEGER,
      kind        TEXT NOT NULL CHECK (kind IN ('modify','remove','add')),
      start_min   INTEGER,
      end_min     INTEGER,
      title       TEXT,
      category    TEXT,
      is_primary  INTEGER,
      notes       TEXT,
      created_at  INTEGER NOT NULL,
      FOREIGN KEY (block_id) REFERENCES schedule_blocks(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_schedule_overrides_date ON schedule_overrides(date);
    -- One override per (date, block) so re-editing the same day replaces rather
    -- than stacks. 'add' rows have a NULL block_id, which SQLite treats as
    -- distinct in a UNIQUE index, so multiple additions per date still work.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_overrides_unique
      ON schedule_overrides(date, block_id);

    -- v0.9 — per-category plan notes. One Markdown document per category per
    -- day; checkboxes live in the text as "- [ ]", so there is no separate
    -- task table. (v0.9.0 briefly had a plan_items table — superseded, and
    -- folded into the notes by migratePlanItemsIntoNotes below.)
    CREATE TABLE IF NOT EXISTS plan_notes (
      id          INTEGER PRIMARY KEY,
      category    TEXT NOT NULL,
      date        TEXT NOT NULL,
      body        TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_notes_unique
      ON plan_notes(category, date);
    CREATE INDEX IF NOT EXISTS idx_plan_notes_date ON plan_notes(date);
  `);
}

export function insertEvent(e: NewActivityEvent): number {
  const stmt = getDb().prepare(`
    INSERT INTO events (
      start_ts, end_ts, duration_ms,
      exe, exe_path, title, url, domain, browser_profile, project,
      is_idle, is_locked
    ) VALUES (
      @startTs, @endTs, @durationMs,
      @exe, @exePath, @title, @url, @domain, @browserProfile, @project,
      @isIdle, @isLocked
    )
  `);
  const r = stmt.run({
    startTs: e.startTs,
    endTs: e.endTs,
    durationMs: e.durationMs,
    exe: e.exe,
    exePath: e.exePath,
    title: e.title,
    url: e.url,
    domain: e.domain,
    browserProfile: e.browserProfile,
    project: e.project,
    isIdle: e.isIdle ? 1 : 0,
    isLocked: e.isLocked ? 1 : 0,
  });
  return Number(r.lastInsertRowid);
}

interface EventRow {
  id: number;
  start_ts: number;
  end_ts: number;
  duration_ms: number;
  exe: string;
  exe_path: string | null;
  title: string | null;
  url: string | null;
  domain: string | null;
  browser_profile: string | null;
  project: string | null;
  is_idle: number;
  is_locked: number;
}

function rowToEvent(r: EventRow): ActivityEvent {
  return {
    id: r.id,
    startTs: r.start_ts,
    endTs: r.end_ts,
    durationMs: r.duration_ms,
    exe: r.exe,
    exePath: r.exe_path,
    title: r.title,
    url: r.url,
    domain: r.domain,
    browserProfile: r.browser_profile,
    project: r.project,
    isIdle: r.is_idle === 1,
    isLocked: r.is_locked === 1,
  };
}

export function getEventsInRange(startTs: number, endTs: number): ActivityEvent[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM events WHERE end_ts > ? AND start_ts < ? ORDER BY start_ts ASC`
    )
    .all(startTs, endTs) as EventRow[];
  return rows.map(rowToEvent);
}

interface RuleRow {
  id: number;
  match_type: string;
  pattern: string;
  category: string;
  weight: number;
  priority: number;
}

export function getCategoryRules(): CategoryRule[] {
  const rows = getDb()
    .prepare(`SELECT * FROM category_rules ORDER BY priority DESC`)
    .all() as RuleRow[];
  return rows.map((r) => ({
    id: r.id,
    matchType: r.match_type as CategoryRule["matchType"],
    pattern: r.pattern,
    category: r.category,
    weight: r.weight,
    priority: r.priority,
  }));
}

export function insertCategoryRule(r: NewCategoryRule): number {
  const stmt = getDb().prepare(`
    INSERT INTO category_rules (match_type, pattern, category, weight, priority)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(r.matchType, r.pattern, r.category, r.weight, r.priority);
  return Number(result.lastInsertRowid);
}

interface ReportRow {
  id: number;
  kind: string;
  period_start: number;
  period_end: number;
  payload: string;
  created_at: number;
}

export function listReports(kind?: "daily" | "weekly", limit = 60): PersistedReportRef[] {
  const sql = kind
    ? `SELECT id, kind, period_start, period_end, created_at
         FROM reports WHERE kind = ?
         ORDER BY period_start DESC LIMIT ?`
    : `SELECT id, kind, period_start, period_end, created_at
         FROM reports ORDER BY period_start DESC LIMIT ?`;
  const rows = (kind
    ? getDb().prepare(sql).all(kind, limit)
    : getDb().prepare(sql).all(limit)) as Omit<ReportRow, "payload">[];
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as "daily" | "weekly",
    periodStart: r.period_start,
    periodEnd: r.period_end,
    createdAt: r.created_at,
  }));
}

export function getReportPayload(id: number): unknown | null {
  const row = getDb()
    .prepare(`SELECT payload FROM reports WHERE id = ?`)
    .get(id) as { payload: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.payload);
  } catch {
    return null;
  }
}

/** Latest saved AI review for a reporting period (from Generate now or scheduler). */
export function getLatestAiReviewForPeriod(
  kind: "daily" | "weekly",
  periodStart: number
): AiReview | null {
  const row = getDb()
    .prepare(
      `SELECT payload FROM reports
       WHERE kind = ? AND period_start = ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(kind, periodStart) as { payload: string } | undefined;
  if (!row) return null;
  try {
    const payload = JSON.parse(row.payload) as { aiReview?: AiReview };
    return payload.aiReview ?? null;
  } catch {
    return null;
  }
}

// ---- categories ----

interface CategoryRow {
  id: number;
  name: string;
  description: string;
  color: string;
  weight: number;
  is_default: number;
  is_health_tracked: number;
  target_min_per_day: number | null;
  target_min_per_week: number | null;
  created_at: number;
}

function rowToCategory(r: CategoryRow): Category {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    color: r.color,
    weight: r.weight,
    isDefault: r.is_default === 1,
    isHealthTracked: r.is_health_tracked === 1,
    targetMinPerDay: r.target_min_per_day,
    targetMinPerWeek: r.target_min_per_week,
    createdAt: r.created_at,
  };
}

export function listCategories(): Category[] {
  const rows = getDb()
    .prepare(`SELECT * FROM categories ORDER BY is_health_tracked DESC, name ASC`)
    .all() as CategoryRow[];
  return rows.map(rowToCategory);
}

export function getCategoryByName(name: string): Category | null {
  const row = getDb()
    .prepare(`SELECT * FROM categories WHERE name = ?`)
    .get(name) as CategoryRow | undefined;
  return row ? rowToCategory(row) : null;
}

export function insertCategory(c: NewCategory): number {
  const stmt = getDb().prepare(`
    INSERT INTO categories (
      name, description, color, weight,
      is_default, is_health_tracked,
      target_min_per_day, target_min_per_week,
      created_at
    ) VALUES (
      @name, @description, @color, @weight,
      @isDefault, @isHealthTracked,
      @targetMinPerDay, @targetMinPerWeek,
      @createdAt
    )
  `);
  const r = stmt.run({
    name: c.name,
    description: c.description,
    color: c.color,
    weight: c.weight,
    isDefault: c.isDefault ? 1 : 0,
    isHealthTracked: c.isHealthTracked ? 1 : 0,
    targetMinPerDay: c.targetMinPerDay,
    targetMinPerWeek: c.targetMinPerWeek,
    createdAt: Date.now(),
  });
  return Number(r.lastInsertRowid);
}

export function updateCategory(id: number, patch: CategoryPatch): Category | null {
  const fields: string[] = [];
  const params: Record<string, unknown> = { id };
  const mapping: Record<keyof CategoryPatch, string> = {
    name: "name",
    description: "description",
    color: "color",
    weight: "weight",
    isHealthTracked: "is_health_tracked",
    targetMinPerDay: "target_min_per_day",
    targetMinPerWeek: "target_min_per_week",
  };
  for (const [k, col] of Object.entries(mapping) as [keyof CategoryPatch, string][]) {
    if (patch[k] === undefined) continue;
    fields.push(`${col} = @${k}`);
    const v = patch[k];
    params[k] = typeof v === "boolean" ? (v ? 1 : 0) : (v as unknown);
  }
  if (fields.length === 0) {
    const cur = getDb()
      .prepare(`SELECT * FROM categories WHERE id = ?`)
      .get(id) as CategoryRow | undefined;
    return cur ? rowToCategory(cur) : null;
  }
  getDb().prepare(`UPDATE categories SET ${fields.join(", ")} WHERE id = @id`).run(params);
  const row = getDb()
    .prepare(`SELECT * FROM categories WHERE id = ?`)
    .get(id) as CategoryRow | undefined;
  return row ? rowToCategory(row) : null;
}

export function deleteCategory(id: number): boolean {
  const row = getDb()
    .prepare(`SELECT is_default FROM categories WHERE id = ?`)
    .get(id) as { is_default: number } | undefined;
  if (!row) return false;
  if (row.is_default === 1) return false;
  getDb().prepare(`DELETE FROM categories WHERE id = ?`).run(id);
  return true;
}

export function seedDefaultCategoriesIfMissing(): void {
  const d = getDb();
  const existing = new Set(
    (d.prepare(`SELECT name FROM categories`).all() as { name: string }[]).map(
      (r) => r.name
    )
  );
  const tx = d.transaction((cats: NewCategory[]) => {
    for (const c of cats) {
      if (existing.has(c.name)) continue;
      insertCategory(c);
    }
  });
  tx(DEFAULT_CATEGORIES);
}

/** Keep default category AI hints up to date (safe — only touches is_default rows). */
export function refreshDefaultCategoryHints(): void {
  const stmt = getDb().prepare(`
    UPDATE categories
       SET description = ?,
           color = ?,
           weight = ?,
           is_health_tracked = ?,
           target_min_per_day = ?,
           target_min_per_week = ?
     WHERE name = ? AND is_default = 1
  `);
  for (const c of DEFAULT_CATEGORIES) {
    stmt.run(
      c.description,
      c.color,
      c.weight,
      c.isHealthTracked ? 1 : 0,
      c.targetMinPerDay,
      c.targetMinPerWeek,
      c.name
    );
  }
}

// ---- event tags ----

interface EventTagRow {
  id: number;
  event_id: number;
  category: string;
  source: string;
  confidence: number | null;
  model: string | null;
  created_at: number;
}

function rowToTag(r: EventTagRow): EventTag {
  return {
    id: r.id,
    eventId: r.event_id,
    category: r.category,
    source: r.source as EventTag["source"],
    confidence: r.confidence,
    model: r.model,
    createdAt: r.created_at,
  };
}

export function insertEventTags(tags: readonly NewEventTag[]): number {
  if (tags.length === 0) return 0;
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO event_tags (event_id, category, source, confidence, model, created_at)
    VALUES (@eventId, @category, @source, @confidence, @model, @createdAt)
  `);
  let inserted = 0;
  const tx = d.transaction(() => {
    const now = Date.now();
    for (const t of tags) {
      stmt.run({
        eventId: t.eventId,
        category: t.category,
        source: t.source,
        confidence: t.confidence,
        model: t.model,
        createdAt: now,
      });
      inserted++;
    }
  });
  tx();
  return inserted;
}

export function getTagsForEventIds(ids: readonly number[]): Map<number, EventTag[]> {
  const out = new Map<number, EventTag[]>();
  if (ids.length === 0) return out;
  const placeholders = ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT * FROM event_tags WHERE event_id IN (${placeholders}) ORDER BY created_at ASC`
    )
    .all(...ids) as EventTagRow[];
  for (const r of rows) {
    const tag = rowToTag(r);
    const arr = out.get(tag.eventId);
    if (arr) arr.push(tag);
    else out.set(tag.eventId, [tag]);
  }
  return out;
}

/**
 * Find events older than `minAgeMs` that haven't been AI-classified yet,
 * have a meaningful title, and aren't idle/locked. Returns the most
 * recent first so the user sees timely tags.
 */
export function findEventsNeedingAi(
  minAgeMs: number,
  limit: number
): ActivityEvent[] {
  const before = Date.now() - minAgeMs;
  const rows = getDb()
    .prepare(
      `SELECT e.* FROM events e
       LEFT JOIN event_tags t
         ON t.event_id = e.id AND t.source = 'ai'
       WHERE t.id IS NULL
         AND e.is_idle = 0 AND e.is_locked = 0
         AND e.end_ts < ?
         AND e.duration_ms >= 5000
         AND lower(e.exe) NOT IN (
           'code.exe',
           'cursor.exe',
           'windsurf.exe',
           'codex.exe',
           'snippingtool.exe',
           'shellexperiencehost.exe',
           'shellhost.exe',
           -- Linux binaries carry no .exe suffix
           'code',
           'cursor',
           'windsurf',
           'codium',
           'gnome-shell',
           'gnome-screenshot',
           'xdg-desktop-portal-gnome'
         )
         AND coalesce(e.domain, '') NOT IN (
           'biblegateway.com',
           'bible.com',
           'youversion.com',
           'biblehub.com',
           'openbible.info'
         )
         AND coalesce(e.title, '') <> 'Desktop Tracker'
         AND (
           (e.title IS NOT NULL AND length(e.title) >= 6)
           OR (e.url IS NOT NULL AND length(e.url) >= 8)
         )
       ORDER BY e.end_ts DESC
       LIMIT ?`
    )
    .all(before, limit) as EventRow[];
  return rows.map(rowToEvent);
}

// ---- notification log ----

interface NotificationLogRow {
  id: number;
  ts: number;
  kind: string;
  channel: string;
  title: string;
  body: string;
  meta: string | null;
}

function rowToNotificationLog(r: NotificationLogRow): NotificationLogEntry {
  let meta: Record<string, unknown> | null = null;
  if (r.meta) {
    try {
      meta = JSON.parse(r.meta);
    } catch {
      /* ignore corrupt meta */
    }
  }
  return {
    id: r.id,
    ts: r.ts,
    kind: r.kind as NotificationLogEntry["kind"],
    channel: r.channel as NotificationLogEntry["channel"],
    title: r.title,
    body: r.body,
    meta,
  };
}

export function insertNotificationLog(
  entry: Omit<NotificationLogEntry, "id">
): NotificationLogEntry {
  const r = getDb()
    .prepare(
      `INSERT INTO notification_log (ts, kind, channel, title, body, meta)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      entry.ts,
      entry.kind,
      entry.channel,
      entry.title,
      entry.body,
      entry.meta ? JSON.stringify(entry.meta) : null
    );
  return { ...entry, id: Number(r.lastInsertRowid) };
}

export function listNotificationLog(limit = 30): NotificationLogEntry[] {
  const rows = getDb()
    .prepare(`SELECT * FROM notification_log ORDER BY ts DESC LIMIT ?`)
    .all(limit) as NotificationLogRow[];
  return rows.map(rowToNotificationLog);
}

export function lastNotificationOfKindToday(
  kind: NotificationLogEntry["kind"]
): NotificationLogEntry | null {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const row = getDb()
    .prepare(
      `SELECT * FROM notification_log
       WHERE kind = ? AND ts >= ?
       ORDER BY ts DESC LIMIT 1`
    )
    .get(kind, dayStart.getTime()) as NotificationLogRow | undefined;
  return row ? rowToNotificationLog(row) : null;
}

// ---- weekly schedule ----

interface ScheduleBlockRow {
  id: number;
  day_of_week: number;
  start_min: number;
  end_min: number;
  title: string;
  category: string;
  is_primary: number;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

function rowToScheduleBlock(r: ScheduleBlockRow): ScheduleBlock {
  return {
    id: r.id,
    dayOfWeek: r.day_of_week as ScheduleBlock["dayOfWeek"],
    startMin: r.start_min,
    endMin: r.end_min,
    title: r.title,
    category: r.category,
    isPrimary: r.is_primary === 1,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listScheduleBlocks(): ScheduleBlock[] {
  const rows = getDb()
    .prepare(`SELECT * FROM schedule_blocks ORDER BY day_of_week ASC, start_min ASC`)
    .all() as ScheduleBlockRow[];
  return rows.map(rowToScheduleBlock);
}

/**
 * Exactly one block per day is the most important task, so promoting one
 * demotes the rest of that day. Keeping the invariant here means no caller can
 * write a day with two stars (or, after an edit, none).
 */
function demoteOtherPrimaries(dayOfWeek: number, keepId: number | null): void {
  getDb()
    .prepare(
      `UPDATE schedule_blocks SET is_primary = 0
        WHERE day_of_week = ? AND id IS NOT ?`
    )
    .run(dayOfWeek, keepId);
}

/**
 * If a day lost its most important task, promote its earliest block.
 *
 * `preferNotId` is the block that was just un-starred: hand the star to
 * something else so un-starring visibly does something. It only goes back to
 * that block when it is the day's last one, since a populated day must always
 * have exactly one.
 */
function ensureDayHasPrimary(dayOfWeek: number, preferNotId: number | null = null): void {
  const d = getDb();
  const has = d
    .prepare(
      `SELECT 1 FROM schedule_blocks WHERE day_of_week = ? AND is_primary = 1 LIMIT 1`
    )
    .get(dayOfWeek);
  if (has) return;

  const pick = d.prepare(
    `SELECT id FROM schedule_blocks
      WHERE day_of_week = ? AND id IS NOT ?
      ORDER BY start_min ASC LIMIT 1`
  );
  const next =
    (pick.get(dayOfWeek, preferNotId) as { id: number } | undefined) ??
    (preferNotId === null
      ? undefined
      : (pick.get(dayOfWeek, null) as { id: number } | undefined));
  if (!next) return;
  d.prepare(`UPDATE schedule_blocks SET is_primary = 1 WHERE id = ?`).run(next.id);
}

export function insertScheduleBlock(b: NewScheduleBlock): ScheduleBlock {
  const d = getDb();
  const tx = d.transaction(() => {
    const now = Date.now();
    const r = d
      .prepare(
        `INSERT INTO schedule_blocks
           (day_of_week, start_min, end_min, title, category, is_primary, notes,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        b.dayOfWeek,
        b.startMin,
        b.endMin,
        b.title,
        b.category,
        b.isPrimary ? 1 : 0,
        b.notes,
        now,
        now
      );
    const id = Number(r.lastInsertRowid);
    if (b.isPrimary) demoteOtherPrimaries(b.dayOfWeek, id);
    else ensureDayHasPrimary(b.dayOfWeek);
    return id;
  });
  const id = tx();
  return getScheduleBlock(id)!;
}

export function getScheduleBlock(id: number): ScheduleBlock | null {
  const row = getDb()
    .prepare(`SELECT * FROM schedule_blocks WHERE id = ?`)
    .get(id) as ScheduleBlockRow | undefined;
  return row ? rowToScheduleBlock(row) : null;
}

export function updateScheduleBlock(
  id: number,
  patch: ScheduleBlockPatch
): ScheduleBlock | null {
  const d = getDb();
  const existing = getScheduleBlock(id);
  if (!existing) return null;

  const mapping: Record<keyof ScheduleBlockPatch, string> = {
    dayOfWeek: "day_of_week",
    startMin: "start_min",
    endMin: "end_min",
    title: "title",
    category: "category",
    isPrimary: "is_primary",
    notes: "notes",
  };

  const tx = d.transaction(() => {
    const fields: string[] = [];
    const params: Record<string, unknown> = { id };
    for (const [k, col] of Object.entries(mapping) as [
      keyof ScheduleBlockPatch,
      string,
    ][]) {
      const v = patch[k];
      if (v === undefined) continue;
      fields.push(`${col} = @${k}`);
      params[k] = typeof v === "boolean" ? (v ? 1 : 0) : (v as unknown);
    }
    if (fields.length > 0) {
      fields.push("updated_at = @updatedAt");
      params.updatedAt = Date.now();
      d.prepare(`UPDATE schedule_blocks SET ${fields.join(", ")} WHERE id = @id`).run(
        params
      );
    }
    const day = patch.dayOfWeek ?? existing.dayOfWeek;
    const isPrimary = patch.isPrimary ?? existing.isPrimary;

    // A starred block carries its star across a day move, so the destination
    // day has to be re-checked even when isPrimary itself did not change.
    if (isPrimary) demoteOtherPrimaries(day, id);
    else ensureDayHasPrimary(day, id);

    // Moving a block out of a day can leave that day starless.
    if (patch.dayOfWeek !== undefined && patch.dayOfWeek !== existing.dayOfWeek) {
      ensureDayHasPrimary(existing.dayOfWeek);
    }
  });
  tx();
  return getScheduleBlock(id);
}

export function deleteScheduleBlock(id: number): boolean {
  const d = getDb();
  const existing = getScheduleBlock(id);
  if (!existing) return false;
  const tx = d.transaction(() => {
    d.prepare(`DELETE FROM schedule_blocks WHERE id = ?`).run(id);
    ensureDayHasPrimary(existing.dayOfWeek);
  });
  tx();
  return true;
}

interface ScheduleOverrideRow {
  id: number;
  date: string;
  block_id: number | null;
  kind: string;
  start_min: number | null;
  end_min: number | null;
  title: string | null;
  category: string | null;
  is_primary: number | null;
  notes: string | null;
  created_at: number;
}

function rowToScheduleOverride(r: ScheduleOverrideRow): ScheduleOverride {
  return {
    id: r.id,
    date: r.date,
    blockId: r.block_id,
    kind: r.kind as ScheduleOverride["kind"],
    startMin: r.start_min,
    endMin: r.end_min,
    title: r.title,
    category: r.category,
    isPrimary: r.is_primary === null ? null : r.is_primary === 1,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

/** Overrides in a date window, inclusive. Omit both bounds for all of them. */
export function listScheduleOverrides(
  fromDate?: string,
  toDate?: string
): ScheduleOverride[] {
  const d = getDb();
  const rows = (
    fromDate && toDate
      ? d
          .prepare(
            `SELECT * FROM schedule_overrides WHERE date BETWEEN ? AND ? ORDER BY date ASC`
          )
          .all(fromDate, toDate)
      : d.prepare(`SELECT * FROM schedule_overrides ORDER BY date ASC`).all()
  ) as ScheduleOverrideRow[];
  return rows.map(rowToScheduleOverride);
}

/**
 * Write a one-date exception, replacing any existing override for the same
 * (date, template block) pair so repeated edits to one day do not pile up.
 */
export function upsertScheduleOverride(o: NewScheduleOverride): ScheduleOverride {
  const d = getDb();
  const tx = d.transaction(() => {
    if (o.blockId != null) {
      d.prepare(`DELETE FROM schedule_overrides WHERE date = ? AND block_id = ?`).run(
        o.date,
        o.blockId
      );
    }
    if (o.isPrimary === true) {
      // Only one most-important task on the day, overrides included.
      d.prepare(
        `UPDATE schedule_overrides SET is_primary = 0 WHERE date = ? AND is_primary = 1`
      ).run(o.date);
    }
    const r = d
      .prepare(
        `INSERT INTO schedule_overrides
           (date, block_id, kind, start_min, end_min, title, category, is_primary,
            notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        o.date,
        o.blockId,
        o.kind,
        o.startMin,
        o.endMin,
        o.title,
        o.category,
        o.isPrimary === null ? null : o.isPrimary ? 1 : 0,
        o.notes,
        Date.now()
      );
    return Number(r.lastInsertRowid);
  });
  const id = tx();
  const row = d
    .prepare(`SELECT * FROM schedule_overrides WHERE id = ?`)
    .get(id) as ScheduleOverrideRow;
  return rowToScheduleOverride(row);
}

export function deleteScheduleOverride(id: number): boolean {
  const r = getDb().prepare(`DELETE FROM schedule_overrides WHERE id = ?`).run(id);
  return r.changes > 0;
}

/** Drop every exception for a date, reverting it to the weekly template. */
export function clearScheduleOverridesForDate(date: string): number {
  const r = getDb().prepare(`DELETE FROM schedule_overrides WHERE date = ?`).run(date);
  return r.changes;
}

/**
 * Give a fresh install a plan to react to rather than an empty grid: a daily
 * study anchor plus weekday work blocks. Only ever runs when the schedule is
 * completely empty, so it cannot overwrite a real plan — and every block is
 * editable or deletable from the Schedule page.
 */
export function seedExampleScheduleIfEmpty(): void {
  const d = getDb();
  const { c } = d.prepare(`SELECT COUNT(*) as c FROM schedule_blocks`).get() as {
    c: number;
  };
  if (c > 0) return;

  const HOUR = 60;
  const study = { startMin: 9 * HOUR + 30, endMin: 10 * HOUR + 30 };
  const workDays = [0, 1, 2, 4]; // Mon, Tue, Wed, Fri

  const blocks: NewScheduleBlock[] = [];
  for (let day = 0; day <= 6; day++) {
    const isWorkDay = workDays.includes(day);
    blocks.push({
      dayOfWeek: day as NewScheduleBlock["dayOfWeek"],
      ...study,
      title: "Bible study",
      category: "Religion",
      // On a day with no work blocks, study is what matters most.
      isPrimary: !isWorkDay,
      notes: null,
    });
    if (!isWorkDay) continue;
    blocks.push({
      dayOfWeek: day as NewScheduleBlock["dayOfWeek"],
      startMin: 10 * HOUR + 30,
      endMin: 13 * HOUR,
      title: "Startup — deep work",
      category: "Work",
      isPrimary: true,
      notes: null,
    });
    blocks.push({
      dayOfWeek: day as NewScheduleBlock["dayOfWeek"],
      startMin: 14 * HOUR,
      endMin: 17 * HOUR + 30,
      title: "Startup — afternoon",
      category: "Work",
      isPrimary: false,
      notes: null,
    });
  }

  const tx = d.transaction(() => {
    for (const b of blocks) insertScheduleBlock(b);
  });
  tx();
  console.log(`[db] seeded ${blocks.length} example schedule block(s)`);
}

/** Housekeeping: overrides for dates already in the past have no further use. */
export function pruneOldScheduleOverrides(beforeDate: string): number {
  const r = getDb()
    .prepare(`DELETE FROM schedule_overrides WHERE date < ?`)
    .run(beforeDate);
  if (r.changes > 0) {
    console.log(`[db] pruned ${r.changes} expired schedule override(s)`);
  }
  return r.changes;
}

// ---- settings ----

export function getSetting(key: string): string | null {
  const row = getDb()
    .prepare(`SELECT value FROM settings WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value);
}

export function deleteSetting(key: string): void {
  getDb().prepare(`DELETE FROM settings WHERE key = ?`).run(key);
}

export function seedDefaultRulesIfEmpty(): void {
  const d = getDb();
  const { c } = d.prepare(`SELECT COUNT(*) as c FROM category_rules`).get() as { c: number };
  if (c > 0) return;

  const insert = d.prepare(`
    INSERT INTO category_rules (match_type, pattern, category, weight, priority)
    VALUES (?, ?, ?, ?, ?)
  `);
  const tx = d.transaction((rules: NewCategoryRule[]) => {
    for (const r of rules) {
      insert.run(r.matchType, r.pattern, r.category, r.weight, r.priority);
    }
  });
  tx([...DEFAULT_APP_RULES, ...DEFAULT_DOMAIN_RULES]);
  console.log(
    `[db] seeded ${DEFAULT_APP_RULES.length + DEFAULT_DOMAIN_RULES.length} default rules`
  );
}

/**
 * Sites where the same domain can be productive OR distraction depending on
 * the specific page/video. Remove blunt domain→Entertainment rules so AI
 * tagging (from title + URL) decides.
 */
export function migrateAmbiguousDomainRules(): void {
  const patterns = ["youtube.com", "youtu.be"];
  const r = getDb()
    .prepare(
      `DELETE FROM category_rules
       WHERE match_type = 'domain' AND pattern IN (${patterns.map(() => "?").join(",")})`
    )
    .run(...patterns);
  if (r.changes > 0) {
    console.log(`[db] removed ${r.changes} blunt domain rule(s) for mixed-content sites`);
  }
}

/** Rewrite old scaffold rule categories (Coding, Research, …) → user taxonomy. */
export function migrateLegacyRuleCategories(): void {
  const d = getDb();
  const map: Record<string, string> = {
    Coding: "Work",
    Research: "Learning",
    Writing: "Work",
    Design: "Work",
    Communication: "Work",
    Meetings: "Work",
    Gaming: "Entertainment",
    System: "Work",
  };
  const stmt = d.prepare(`UPDATE category_rules SET category = ? WHERE category = ?`);
  for (const [from, to] of Object.entries(map)) {
    const r = stmt.run(to, from);
    if (r.changes > 0) {
      console.log(`[db] migrated ${r.changes} rule(s): ${from} → ${to}`);
    }
  }
}

/** AI "Other" tags override good domain rules — drop them so rules + hints apply. */
export function purgeAiOtherTags(): void {
  const r = getDb()
    .prepare(`DELETE FROM event_tags WHERE source = 'ai' AND category = 'Other'`)
    .run();
  if (r.changes > 0) {
    console.log(`[db] purged ${r.changes} AI Other tag(s)`);
  }
}

/** Rename the old neutral bucket so it never appears in the UI again. */
export function migrateOtherToUnclassified(): void {
  if (getSetting("no_other_category_v1")) return;
  const d = getDb();
  const hasOther = d
    .prepare(`SELECT 1 FROM categories WHERE name = 'Other' LIMIT 1`)
    .get();
  const hasUnclassified = d
    .prepare(`SELECT 1 FROM categories WHERE name = 'Unclassified' LIMIT 1`)
    .get();

  const tx = d.transaction(() => {
    if (hasOther && !hasUnclassified) {
      d.prepare(`UPDATE categories SET name = 'Unclassified' WHERE name = 'Other'`)
        .run();
    } else if (hasOther && hasUnclassified) {
      d.prepare(`DELETE FROM categories WHERE name = 'Other'`).run();
    }

    d.prepare(
      `UPDATE category_rules SET category = 'Unclassified' WHERE category = 'Other'`
    ).run();
    d.prepare(
      `UPDATE event_tags SET category = 'Unclassified' WHERE category = 'Other'`
    ).run();
    d.prepare(
      `UPDATE reports SET payload = replace(payload, 'Other', 'Unclassified')
       WHERE payload LIKE '%Other%'`
    ).run();
    d.prepare(
      `UPDATE notification_log SET body = replace(body, 'Other', 'Unclassified')
       WHERE body LIKE '%Other%'`
    ).run();
    d.prepare(
      `UPDATE notification_log SET meta = replace(meta, 'Other', 'Unclassified')
       WHERE meta LIKE '%Other%'`
    ).run();
    setSetting("no_other_category_v1", "1");
  });
  tx();
  console.log("[db] migrated neutral category name to Unclassified");
}

/** Move known OS/app-chrome utility rules out of the fallback bucket. */
export function migrateSystemCategoryV1(): void {
  if (getSetting("system_category_v1")) return;
  const d = getDb();
  const tx = d.transaction(() => {
    for (const c of DEFAULT_CATEGORIES) {
      if (c.name !== "System") continue;
      const exists = d
        .prepare(`SELECT 1 FROM categories WHERE name = ? LIMIT 1`)
        .get(c.name);
      if (!exists) insertCategory(c);
    }
    d.prepare(
      `UPDATE category_rules
          SET category = 'System'
        WHERE category = 'Unclassified'
          AND (
            pattern IN (
              'snippingtool.exe',
              'shellexperiencehost.exe',
              'shellhost.exe',
              '^Desktop Tracker$'
            )
            OR pattern LIKE '%New Tab%'
          )`
    ).run();
    d.prepare(
      `DELETE FROM event_tags
       WHERE source = 'ai'
         AND event_id IN (
           SELECT id FROM events
           WHERE lower(exe) IN (
             'snippingtool.exe',
             'shellexperiencehost.exe',
             'shellhost.exe',
             'notepad.exe'
           )
              OR title = 'Desktop Tracker'
              OR title LIKE 'New Tab%'
              OR title LIKE 'Untitled%'
         )`
    ).run();
    setSetting("system_category_v1", "1");
  });
  tx();
  console.log("[db] migrated known utility activity to System");
}

/** Remove early tactical rules that were replaced by broader intent patterns. */
export function migrateGeneralizedTaxonomyRulesV1(): void {
  if (getSetting("generalized_taxonomy_rules_v1")) return;
  const r = getDb()
    .prepare(
      `DELETE FROM category_rules
       WHERE match_type = 'title_regex'
         AND (
           pattern = '(Codex|OpenAI|programming|coding|developer|tutorial|course|learn|efficiently).+YouTube'
           OR pattern = '(Codex|OpenAI|Midjourney|\\bAI\\b|LLM|programming|coding|developer|tutorial|course|learn|efficiently).+YouTube'
           OR pattern LIKE '%Cosmic Wonder%'
           OR pattern LIKE '%Spider-Man%'
         )`
    )
    .run();
  setSetting("generalized_taxonomy_rules_v1", "1");
  if (r.changes > 0) {
    console.log(`[db] removed ${r.changes} over-specific taxonomy rule(s)`);
  }
}

/** Rewrite legacy AI tag names to the current taxonomy. */
export function migrateAiLegacyTagCategories(): void {
  const d = getDb();
  const map: Record<string, string> = {
    Coding: "Work",
    Research: "Learning",
    Writing: "Work",
    Design: "Work",
    Communication: "Work",
    Meetings: "Work",
    Gaming: "Entertainment",
    System: "Work",
    Other: "Unclassified",
  };
  const stmt = d.prepare(
    `UPDATE event_tags SET category = ? WHERE source = 'ai' AND category = ?`
  );
  for (const [from, to] of Object.entries(map)) {
    const r = stmt.run(to, from);
    if (r.changes > 0) {
      console.log(`[db] migrated ${r.changes} AI tag(s): ${from} → ${to}`);
    }
  }
}

/**
 * One-time: wipe all AI tags so the improved classifier (70B + new prompt)
 * re-labels history. Old 8B-instant tags were the main misclassification source.
 */
export function migrateClassifierV2Retag(): void {
  if (getSetting("ai_classifier_v2")) return;
  const r = getDb().prepare(`DELETE FROM event_tags WHERE source = 'ai'`).run();
  setSetting("ai_classifier_v2", "1");
  if (r.changes > 0) {
    console.log(`[db] classifier v2: cleared ${r.changes} AI tag(s) for re-classification`);
  }
}

/** Re-tag YouTube sessions after prompt fix (hustle videos → Entertainment not Business). */
export function migrateYoutubeAiRetag(): void {
  if (getSetting("youtube_hustle_prompt_v1")) return;
  const r = getDb()
    .prepare(
      `DELETE FROM event_tags
       WHERE source = 'ai'
         AND event_id IN (
           SELECT id FROM events
           WHERE domain LIKE '%youtube.com%' OR domain LIKE '%youtu.be%'
         )`
    )
    .run();
  setSetting("youtube_hustle_prompt_v1", "1");
  if (r.changes > 0) {
    console.log(`[db] cleared ${r.changes} YouTube AI tag(s) for re-classification`);
  }
}

/** Re-tag career/job-search domains after adding the Career category. */
export function migrateCareerAiRetag(): void {
  if (getSetting("career_category_v1")) return;
  const domains = [
    "%linkedin.com%",
    "%indeed.com%",
    "%glassdoor.com%",
    "%greenhouse.io%",
    "%lever.co%",
    "%wellfound.com%",
    "%workdayjobs.com%",
  ];
  const r = getDb()
    .prepare(
      `DELETE FROM event_tags
       WHERE source = 'ai'
         AND event_id IN (
           SELECT id FROM events
           WHERE ${domains.map(() => "domain LIKE ?").join(" OR ")}
         )`
    )
    .run(...domains);
  setSetting("career_category_v1", "1");
  if (r.changes > 0) {
    console.log(`[db] cleared ${r.changes} career-domain AI tag(s) for re-classification`);
  }
}

/** Clear stale tags that are now covered by strong deterministic rules. */
export function migrateStrongRuleRetag(): void {
  if (getSetting("strong_rule_retag_v2")) return;
  const r = getDb()
    .prepare(
      `DELETE FROM event_tags
       WHERE source = 'ai'
         AND event_id IN (
           SELECT id FROM events
           WHERE lower(exe) IN (
             'code.exe',
             'cursor.exe',
             'windsurf.exe',
             'codex.exe',
             'snippingtool.exe',
             'shellexperiencehost.exe',
             'shellhost.exe'
           )
              OR domain IN (
                'biblegateway.com',
                'bible.com',
                'youversion.com',
                'biblehub.com',
                'openbible.info'
              )
              OR title = 'Desktop Tracker'
         )`
    )
    .run();
  setSetting("strong_rule_retag_v2", "1");
  if (r.changes > 0) {
    console.log(`[db] cleared ${r.changes} stale strong-rule AI tag(s)`);
  }
}

/** Sync built-in app/domain/title rules into existing installs. */
export function upsertTaxonomyDomainRules(): void {
  const d = getDb();
  const exists = d.prepare(
    `SELECT 1 FROM category_rules WHERE match_type = ? AND pattern = ? LIMIT 1`
  );
  const update = d.prepare(`
    UPDATE category_rules
       SET category = ?, weight = ?, priority = ?
     WHERE match_type = ? AND pattern = ?
  `);
  const insert = d.prepare(`
    INSERT INTO category_rules (match_type, pattern, category, weight, priority)
    VALUES (?, ?, ?, ?, ?)
  `);
  let added = 0;
  let updated = 0;
  for (const rule of [...DEFAULT_APP_RULES, ...DEFAULT_DOMAIN_RULES]) {
    if (exists.get(rule.matchType, rule.pattern)) {
      const r = update.run(
        rule.category,
        rule.weight,
        rule.priority,
        rule.matchType,
        rule.pattern
      );
      updated += r.changes;
    } else {
      insert.run(rule.matchType, rule.pattern, rule.category, rule.weight, rule.priority);
      added++;
    }
  }
  if (added > 0 || updated > 0) {
    console.log(`[db] synced taxonomy domain rule(s): added=${added} updated=${updated}`);
  }
}

// ---------------- per-category plan notes ----------------

interface PlanNoteRow {
  id: number;
  category: string;
  date: string;
  body: string;
  created_at: number;
  updated_at: number;
}

function rowToPlanNote(r: PlanNoteRow): PlanNote {
  return {
    id: r.id,
    category: r.category,
    date: r.date,
    body: r.body,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listPlanNotes(category?: string, limit?: number): PlanNote[] {
  const d = getDb();
  const cap = limit && limit > 0 ? Math.min(limit, 1000) : 500;
  const rows = (
    category
      ? d
          .prepare(
            `SELECT * FROM plan_notes WHERE category = ?
              ORDER BY date DESC, id DESC LIMIT ?`
          )
          .all(category, cap)
      : d
          .prepare(`SELECT * FROM plan_notes ORDER BY date DESC, category ASC LIMIT ?`)
          .all(cap)
  ) as PlanNoteRow[];
  return rows.map(rowToPlanNote);
}

export function getPlanNote(category: string, date: string): PlanNote | null {
  const row = getDb()
    .prepare(`SELECT * FROM plan_notes WHERE category = ? AND date = ?`)
    .get(category, date) as PlanNoteRow | undefined;
  return row ? rowToPlanNote(row) : null;
}

/** Newest note strictly before `date` — the context carried into today. */
export function getPreviousPlanNote(category: string, date: string): PlanNote | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM plan_notes WHERE category = ? AND date < ?
        ORDER BY date DESC LIMIT 1`
    )
    .get(category, date) as PlanNoteRow | undefined;
  return row ? rowToPlanNote(row) : null;
}

/** Write today's note. An empty body deletes the row rather than storing "". */
export function upsertPlanNote(note: NewPlanNote): PlanNote | null {
  const d = getDb();
  const body = note.body.trim();
  if (!body) {
    d.prepare(`DELETE FROM plan_notes WHERE category = ? AND date = ?`).run(
      note.category,
      note.date
    );
    return null;
  }
  const now = Date.now();
  d.prepare(
    `INSERT INTO plan_notes (category, date, body, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(category, date)
       DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`
  ).run(note.category, note.date, body, now, now);
  return getPlanNote(note.category, note.date);
}

export function deletePlanNote(id: number): boolean {
  return getDb().prepare(`DELETE FROM plan_notes WHERE id = ?`).run(id).changes > 0;
}

/**
 * Fold the retired `plan_items` table into today's notes as Markdown
 * checkboxes, then drop it. Runs once — after the table is gone it is a no-op.
 *
 * Items predated the Markdown editor; leaving them stranded in a table nothing
 * reads would silently lose whatever the user had already written.
 */
export function migratePlanItemsIntoNotes(): void {
  const d = getDb();
  const exists = d
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='plan_items'`)
    .get();
  if (!exists) return;

  const rows = d
    .prepare(
      `SELECT category, kind, text, done FROM plan_items
        ORDER BY category ASC, sort_order ASC, id ASC`
    )
    .all() as { category: string; kind: string; text: string; done: number }[];

  if (rows.length > 0) {
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const byCategory = new Map<string, string[]>();
    for (const r of rows) {
      const line =
        r.kind === "task" ? `- [${r.done ? "x" : " "}] ${r.text}` : `- ${r.text}`;
      byCategory.set(r.category, [...(byCategory.get(r.category) ?? []), line]);
    }
    d.transaction(() => {
      for (const [category, lines] of byCategory) {
        const existing = getPlanNote(category, date);
        const body = existing ? `${existing.body}\n\n${lines.join("\n")}` : lines.join("\n");
        upsertPlanNote({ category, date, body });
      }
    })();
    console.log(`[db] folded ${rows.length} plan item(s) into notes`);
  }

  d.exec(`DROP TABLE IF EXISTS plan_items`);
}
