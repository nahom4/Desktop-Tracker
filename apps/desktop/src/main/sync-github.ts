/**
 * GitHub sync — mirrors the tracker's data into a git repo and pushes it.
 *
 * Runs at startup and again right after the end-of-day report, so a day is
 * pushed while it is still that day.
 *
 * The repo is laid out so the three kinds of data stay separable for later
 * analysis — one concern per directory, one file per day:
 *
 *   events/YYYY-MM-DD.json   raw activity events, the ground truth
 *   scores/YYYY-MM-DD.json   derived numbers: productivity, focus, adherence
 *   notes/YYYY-MM-DD.md      what the user wrote that day, grouped by category
 *
 * Events and scores are JSON because they get parsed; notes are Markdown
 * because they get read, and a prose diff is worth more than a quoted string.
 *
 * The token is never written to disk and never appears in argv: it is passed
 * through the environment to an inline credential helper for the push only.
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import {
  buildDailyReport,
  localDateKey,
  startOfLocalDay,
} from "@desktop-tracker/analysis";
import {
  getCategoryRules,
  getEventsInRange,
  getSetting,
  getTagsForEventIds,
  listCategories,
  listPlanNotes,
} from "./db";
import { getDayAdherence } from "./schedule";

const execFileAsync = promisify(execFile);
const DAY_MS = 86_400_000;

/** Days re-exported on every sync. Cheap, and self-heals gaps after downtime. */
const BACKFILL_DAYS = 7;

export interface GithubSyncConfig {
  enabled: boolean;
  repoUrl: string;
  branch: string;
  authorName: string;
  authorEmail: string;
  hasToken: boolean;
}

export interface GithubSyncResult {
  ok: boolean;
  /** Human-readable outcome, surfaced in Settings. */
  message: string;
  committed?: boolean;
  pushed?: boolean;
  at: number;
}

let running = false;
let lastResult: GithubSyncResult | null = null;

export function getLastSyncResult(): GithubSyncResult | null {
  return lastResult;
}

export function getGithubSyncConfig(): GithubSyncConfig {
  return {
    enabled: getSetting("github_sync_enabled") === "1",
    repoUrl: getSetting("github_repo_url") ?? "",
    branch: getSetting("github_branch") || "main",
    authorName: getSetting("github_author_name") || "Desktop Tracker",
    authorEmail: getSetting("github_author_email") || "desktop-tracker@localhost",
    hasToken: Boolean(getSetting("github_token")),
  };
}

function repoDir(): string {
  return path.join(app.getPath("userData"), "sync-repo");
}

async function git(
  args: string[],
  opts: { token?: string } = {}
): Promise<string> {
  const env = { ...process.env };
  if (opts.token) env.DT_GIT_TOKEN = opts.token;
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoDir(),
    env,
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout.trim();
}

/**
 * Credential helper that answers from the environment. Keeps the token out of
 * argv (visible in `ps`) and out of .git/config (persisted in cleartext).
 */
const TOKEN_HELPER =
  '!f() { echo username=x-access-token; echo "password=$DT_GIT_TOKEN"; }; f';

async function ensureRepo(cfg: GithubSyncConfig, token: string): Promise<void> {
  const dir = repoDir();
  fs.mkdirSync(dir, { recursive: true });
  const fresh = !fs.existsSync(path.join(dir, ".git"));
  if (fresh) {
    await git(["init", "-q"]);
    await git(["checkout", "-q", "-B", cfg.branch]);
  }
  await git(["config", "user.name", cfg.authorName]);
  await git(["config", "user.email", cfg.authorEmail]);

  // The remote is stored without credentials; auth comes from the helper.
  const remotes = await git(["remote"]).catch(() => "");
  if (remotes.split(/\s+/).includes("origin")) {
    await git(["remote", "set-url", "origin", cfg.repoUrl]);
  } else {
    await git(["remote", "add", "origin", cfg.repoUrl]);
  }

  // A brand-new local repo pushing at a branch that already has commits — a
  // repo initialised with a README, or a previous install's mirror — would
  // build a history with no ancestor in common with the remote. Every push is
  // then rejected and every rebase conflicts on the files both sides generate.
  // Start from the remote instead, when there is one.
  if (fresh) await adoptRemoteHistory(cfg, token, { hard: true });
}

/**
 * Move onto the remote branch's history while keeping the files we just
 * exported.
 *
 * `hard` is for a fresh repo with nothing to preserve. Otherwise the reset is
 * soft — our regenerated export stays in the working tree — and any file only
 * the remote has (a day older than the backfill window) is restored, so
 * adopting its history can never delete data.
 *
 * Returns false when the remote branch does not exist yet, which is the normal
 * first-push case and not an error.
 */
async function adoptRemoteHistory(
  cfg: GithubSyncConfig,
  token: string,
  opts: { hard?: boolean } = {}
): Promise<boolean> {
  try {
    await git(
      ["-c", `credential.helper=${TOKEN_HELPER}`, "fetch", "-q", "origin", cfg.branch],
      { token }
    );
  } catch {
    return false; // empty remote, or the branch does not exist yet
  }
  const ref = `origin/${cfg.branch}`;
  if (!(await git(["rev-parse", "--verify", "-q", ref]).catch(() => ""))) return false;

  await git(["reset", opts.hard ? "--hard" : "--soft", ref]);
  if (opts.hard) return true;

  const remoteFiles = (await git(["ls-tree", "-r", "--name-only", ref]))
    .split("\n")
    .filter(Boolean);
  for (const rel of remoteFiles) {
    if (!fs.existsSync(path.join(repoDir(), rel))) {
      await git(["checkout", ref, "--", rel]).catch(() => undefined);
    }
  }
  return true;
}

function writeFileIfChanged(rel: string, contents: string): void {
  const full = path.join(repoDir(), rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  // Skip the write when identical so mtimes (and git's stat cache) stay calm.
  if (fs.existsSync(full) && fs.readFileSync(full, "utf8") === contents) return;
  fs.writeFileSync(full, contents);
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

/** Render one day's notes as Markdown, grouped by category. */
function notesMarkdown(date: string, notes: { category: string; body: string }[]): string {
  const lines = [`# Notes — ${date}`, ""];
  for (const n of [...notes].sort((a, b) => a.category.localeCompare(b.category))) {
    lines.push(`## ${n.category}`, "", n.body.trim(), "");
  }
  return lines.join("\n");
}

function exportDay(dayTs: number): void {
  const start = startOfLocalDay(dayTs);
  const end = start + DAY_MS;
  const date = localDateKey(start);

  const events = getEventsInRange(start, end);
  // A day with no activity at all is not worth a file; leave any existing one
  // alone rather than overwriting history with an empty shell.
  if (events.length === 0) return;

  writeFileIfChanged(`events/${date}.json`, json({ date, events }));

  const tags = getTagsForEventIds(events.map((e) => e.id));
  const cats = listCategories();
  const report = buildDailyReport(events, getCategoryRules(), start, end, tags, cats);
  const adherence = getDayAdherence(start);
  writeFileIfChanged(
    `scores/${date}.json`,
    json({
      date,
      productivityScore: report.productivityScore,
      focusScore: report.focusScore,
      productivityQuality: report.productivityQuality,
      activeRatio: report.activeRatio,
      totalActiveMs: report.totalActiveMs,
      totalIdleMs: report.totalIdleMs,
      byCategory: report.breakdown.byCategory,
      health: report.health ?? [],
      schedule: {
        score: adherence.score,
        primaryScore: adherence.primaryScore,
        primaryTitle: adherence.primaryTitle,
        plannedMs: adherence.plannedMs,
        onPlanMs: adherence.onPlanMs,
        blocks: adherence.blocks.map((b) => ({
          title: b.block.title,
          category: b.block.category,
          isPrimary: b.block.isPrimary,
          startMin: b.block.startMin,
          endMin: b.block.endMin,
          elapsedMs: b.elapsedMs,
          onPlanMs: b.onPlanMs,
          offPlanMs: b.offPlanMs,
          unaccountedMs: b.unaccountedMs,
          adherence: b.adherence,
          status: b.status,
        })),
      },
    })
  );

  const notes = listPlanNotes().filter((n) => n.date === date);
  if (notes.length > 0) writeFileIfChanged(`notes/${date}.md`, notesMarkdown(date, notes));
}

function exportAll(): void {
  const now = Date.now();
  for (let i = 0; i < BACKFILL_DAYS; i++) exportDay(now - i * DAY_MS);

  writeFileIfChanged(
    "README.md",
    [
      "# Desktop Tracker data",
      "",
      "Written automatically by Desktop Tracker. One directory per kind of data:",
      "",
      "| path | what |",
      "| --- | --- |",
      "| `events/DATE.json` | raw tracked activity events for that day |",
      "| `scores/DATE.json` | derived scores: productivity, focus, schedule adherence |",
      "| `notes/DATE.md` | notes written that day, grouped by category |",
      "",
    ].join("\n")
  );
}

function fail(message: string): GithubSyncResult {
  lastResult = { ok: false, message, at: Date.now() };
  return lastResult;
}

/**
 * Export, commit, and push. Safe to call when unconfigured — it reports why it
 * did nothing instead of throwing.
 */
export async function syncToGithub(
  opts: { reason?: string } = {}
): Promise<GithubSyncResult> {
  const cfg = getGithubSyncConfig();
  if (!cfg.enabled) return fail("Sync is off.");
  if (!cfg.repoUrl) return fail("No repository URL configured.");
  const token = getSetting("github_token");
  if (!token) return fail("No access token configured.");
  if (running) return fail("A sync is already running.");

  running = true;
  try {
    await ensureRepo(cfg, token);
    exportAll();

    await git(["add", "-A"]);
    const staged = await git(["status", "--porcelain"]);
    if (!staged) {
      lastResult = {
        ok: true,
        message: "Already up to date — nothing changed.",
        committed: false,
        pushed: false,
        at: Date.now(),
      };
      return lastResult;
    }

    const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
    const reason = opts.reason ? ` (${opts.reason})` : "";
    await git(["commit", "-q", "-m", `sync ${stamp}${reason}`]);

    const push = (extra: string[] = []) =>
      git(
        [
          "-c",
          `credential.helper=${TOKEN_HELPER}`,
          "push",
          ...extra,
          "origin",
          `HEAD:${cfg.branch}`,
        ],
        { token }
      );

    try {
      await push(["-u"]);
    } catch {
      // The remote moved — another machine, a manual edit, or a mirror from a
      // previous install. Rebasing is the wrong tool here: every file in this
      // repo is regenerated from the database on each sync, so both sides
      // touch the same paths and a rebase conflicts on all of them. Adopt the
      // remote's history and re-commit the current export on top instead,
      // which cannot conflict and cannot lose either side's files.
      await adoptRemoteHistory(cfg, token);
      await git(["add", "-A"]);
      if (await git(["status", "--porcelain"])) {
        await git(["commit", "-q", "-m", `sync ${stamp}${reason} (reconcile)`]);
      }
      await push();
    }

    lastResult = {
      ok: true,
      message: `Pushed to ${cfg.repoUrl} (${cfg.branch}).`,
      committed: true,
      pushed: true,
      at: Date.now(),
    };
    return lastResult;
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    // Never let a token reach a log line or the UI.
    return fail(raw.replace(/x-access-token:[^@]*@/g, "x-access-token:***@").slice(0, 500));
  } finally {
    running = false;
  }
}
