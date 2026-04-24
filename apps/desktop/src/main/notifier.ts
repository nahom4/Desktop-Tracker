/**
 * Threshold-based notification service.
 *
 * Every hour the scheduler calls `checkAndNotify()`. We sum the user's
 * "non-productive" time over the local-day window (idle + locked + any
 * event whose *effective* category is in the unproductive list) and, if
 * we cross the threshold and haven't already alerted today, fire:
 *   1. an OS toast via Electron's Notification API, and
 *   2. (optional) an SMTP email via nodemailer.
 *
 * The audit log lives in the `notification_log` table so the UI can show
 * what was sent and when.
 */

import { Notification } from "electron";
import nodemailer from "nodemailer";
import {
  categorizeAllWithTags,
  startOfLocalDay,
} from "@desktop-tracker/analysis";
import type {
  NotificationConfig,
  NotificationLogEntry,
} from "@desktop-tracker/shared";
import { DEFAULT_NOTIFICATION_CONFIG } from "@desktop-tracker/shared";
import {
  getCategoryRules,
  getEventsInRange,
  getSetting,
  getTagsForEventIds,
  insertNotificationLog,
  lastNotificationOfKindToday,
  listCategories,
  setSetting,
} from "./db";

const DAY_MS = 86_400_000;
const CONFIG_KEY = "notification_config";
const SMTP_PASS_KEY = "smtp_password"; // stored separately, never returned

// ---------------- config ----------------

/** Returns the saved config, layered over defaults. Password is reported as a boolean only. */
export function getNotificationConfig(): NotificationConfig {
  const raw = getSetting(CONFIG_KEY);
  let parsed: Partial<NotificationConfig> = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* ignore corrupt */
    }
  }
  const merged: NotificationConfig = {
    ...DEFAULT_NOTIFICATION_CONFIG,
    ...parsed,
  };
  merged.smtpPassMasked = Boolean(getSetting(SMTP_PASS_KEY));
  return merged;
}

/**
 * Patch config. `smtpPassword`, when supplied, is stored under its own
 * settings key — it never round-trips back to the renderer.
 */
export function setNotificationConfig(
  patch: Partial<NotificationConfig> & { smtpPassword?: string | null }
): NotificationConfig {
  const cur = getNotificationConfig();
  // smtpPassMasked is computed, not persisted in the JSON blob
  const { smtpPassword, smtpPassMasked: _ignore, ...rest } = patch as Partial<
    NotificationConfig
  > & { smtpPassword?: string | null };
  const next: NotificationConfig = { ...cur, ...rest };
  setSetting(CONFIG_KEY, JSON.stringify(stripComputed(next)));
  if (smtpPassword !== undefined) {
    if (smtpPassword === null || smtpPassword === "") {
      setSetting(SMTP_PASS_KEY, "");
    } else {
      setSetting(SMTP_PASS_KEY, smtpPassword);
    }
  }
  return getNotificationConfig();
}

function stripComputed(c: NotificationConfig): Omit<NotificationConfig, "smtpPassMasked"> {
  const { smtpPassMasked: _, ...rest } = c;
  return rest;
}

// ---------------- threshold check ----------------

export interface ThresholdState {
  unproductiveMs: number;
  thresholdMs: number;
  breaches: boolean;
  breakdown: { category: string; ms: number }[];
}

/** Compute today's non-productive time (idle + listed categories). */
export function computeUnproductiveToday(): ThresholdState {
  const cfg = getNotificationConfig();
  const start = startOfLocalDay(Date.now());
  const end = Date.now();
  const events = getEventsInRange(start, end);
  const cats = listCategories();
  const tags = getTagsForEventIds(events.map((e) => e.id));
  const eff = categorizeAllWithTags(events, getCategoryRules(), tags, cats);

  const unprodSet = new Set(cfg.unproductiveCategories);
  let idleMs = 0;
  const byCat = new Map<string, number>();
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    if (ev.isIdle || ev.isLocked) {
      idleMs += ev.durationMs;
      continue;
    }
    const cat = eff[i]?.category ?? "Learning";
    if (unprodSet.has(cat)) {
      byCat.set(cat, (byCat.get(cat) ?? 0) + ev.durationMs);
    }
  }
  let total = idleMs;
  for (const m of byCat.values()) total += m;

  const breakdown: { category: string; ms: number }[] = [];
  if (idleMs > 0) breakdown.push({ category: "Idle / locked", ms: idleMs });
  for (const [k, v] of byCat) breakdown.push({ category: k, ms: v });
  breakdown.sort((a, b) => b.ms - a.ms);

  return {
    unproductiveMs: total,
    thresholdMs: cfg.unproductiveThresholdMin * 60_000,
    breaches: total >= cfg.unproductiveThresholdMin * 60_000,
    breakdown,
  };
}

// ---------------- dispatch ----------------

function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function buildMessage(state: ThresholdState): { title: string; body: string } {
  const lines = state.breakdown
    .slice(0, 4)
    .map((b) => `• ${b.category}: ${formatDuration(b.ms)}`)
    .join("\n");
  return {
    title: `Non-productive time over threshold (${formatDuration(state.unproductiveMs)})`,
    body:
      `You've spent ${formatDuration(state.unproductiveMs)} today on non-productive activity ` +
      `(threshold ${formatDuration(state.thresholdMs)}).\n\n${lines}`,
  };
}

async function sendOsNotification(title: string, body: string): Promise<boolean> {
  if (!Notification.isSupported()) return false;
  try {
    new Notification({ title, body, silent: false }).show();
    return true;
  } catch (e) {
    console.error("[notifier] OS notification failed:", e);
    return false;
  }
}

async function sendEmail(
  cfg: NotificationConfig,
  title: string,
  body: string
): Promise<boolean> {
  if (!cfg.emailEnabled) return false;
  const pass = getSetting(SMTP_PASS_KEY) ?? "";
  if (!cfg.smtpHost || !cfg.emailFrom || !cfg.emailTo) {
    throw new Error("SMTP config incomplete (host / from / to required).");
  }
  const transporter = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpSecure,
    auth: cfg.smtpUser ? { user: cfg.smtpUser, pass } : undefined,
  });
  await transporter.sendMail({
    from: cfg.emailFrom,
    to: cfg.emailTo,
    subject: title,
    text: body,
  });
  return true;
}

/**
 * Top-level "tick" for the notifier. Called by the scheduler hourly.
 * Idempotent: fires at most once per local-day for the unproductive
 * threshold (audit-log gated).
 */
export async function checkAndNotify(opts: { force?: boolean } = {}): Promise<
  NotificationLogEntry | null
> {
  const cfg = getNotificationConfig();
  const state = computeUnproductiveToday();
  if (!opts.force && !state.breaches) return null;

  const last = lastNotificationOfKindToday("unproductive_threshold");
  if (!opts.force && last) return null;

  const { title, body } = buildMessage(state);
  let osOk = false;
  let emailOk = false;
  let lastError: string | null = null;

  if (cfg.osEnabled) {
    osOk = await sendOsNotification(title, body);
  }
  if (cfg.emailEnabled) {
    try {
      emailOk = await sendEmail(cfg, title, body);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.error("[notifier] email send failed:", lastError);
    }
  }

  const channel: NotificationLogEntry["channel"] =
    osOk && emailOk ? "both" : emailOk ? "email" : "os";

  if (!osOk && !emailOk) {
    // nothing sent — return null without logging so we'll retry next hour
    return null;
  }

  return insertNotificationLog({
    ts: Date.now(),
    kind: "unproductive_threshold",
    channel,
    title,
    body: body + (lastError ? `\n\n[email error] ${lastError}` : ""),
    meta: {
      unproductiveMs: state.unproductiveMs,
      thresholdMs: state.thresholdMs,
      breakdown: state.breakdown,
    },
  });
}

/** Send a test notification on both enabled channels regardless of threshold. */
export async function sendTestNotification(): Promise<{
  os: boolean;
  email: boolean;
  error?: string;
}> {
  const cfg = getNotificationConfig();
  const title = "Desktop Tracker — test notification";
  const body =
    "If you can read this, the channel works. " +
    "Threshold alerts will arrive whenever your non-productive time exceeds the configured limit.";

  let os = false;
  let email = false;
  let error: string | undefined;
  if (cfg.osEnabled) os = await sendOsNotification(title, body);
  if (cfg.emailEnabled) {
    try {
      email = await sendEmail(cfg, title, body);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  if (os || email) {
    insertNotificationLog({
      ts: Date.now(),
      kind: "test",
      channel: os && email ? "both" : email ? "email" : "os",
      title,
      body,
      meta: null,
    });
  }
  return { os, email, error };
}
