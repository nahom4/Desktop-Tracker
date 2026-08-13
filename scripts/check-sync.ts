/**
 * Self-check for the GitHub sync. Run with `npm run check:sync`.
 *
 * Pushes to a throwaway bare repo on disk rather than GitHub, which exercises
 * the whole path — export, commit, push, re-sync — without credentials and
 * without publishing anything. This is the code that runs unattended at 23:55,
 * so the no-op case matters as much as the happy one: a sync that finds no
 * changes must not manufacture a commit.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app } from "electron";
import {
  insertEvent, openDb, closeDb, seedDefaultCategoriesIfMissing,
  seedDefaultRulesIfEmpty, setSetting, upsertPlanNote,
} from "../apps/desktop/src/main/db";
import { syncToGithub, getGithubSyncConfig } from "../apps/desktop/src/main/sync-github";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dt-sync-"));
const userData = path.join(tmp, "userData");
fs.mkdirSync(userData, { recursive: true });
app.setPath("userData", userData);

const bare = path.join(tmp, "remote.git");
execFileSync("git", ["init", "--bare", "-q", "-b", "main", bare]);

void app.whenReady().then(async () => {
  try {
    openDb(path.join(userData, "data.sqlite"));
    seedDefaultRulesIfEmpty();
    seedDefaultCategoriesIfMissing();

    // Disabled by default -> must refuse, not throw.
    let r = await syncToGithub();
    assert.equal(r.ok, false, "sync is off by default");
    assert.match(r.message, /off/i);

    setSetting("github_sync_enabled", "1");
    r = await syncToGithub();
    assert.equal(r.ok, false, "no repo url -> refuses");

    setSetting("github_repo_url", bare);
    setSetting("github_token", "dummy-token-not-used-for-file-transport");
    assert.equal(getGithubSyncConfig().hasToken, true);

    const now = Date.now();
    const day = new Date(now); day.setHours(10, 0, 0, 0);
    insertEvent({
      startTs: day.getTime(), endTs: day.getTime() + 600_000, durationMs: 600_000,
      exe: "code", exePath: "/usr/bin/code", title: "README.md - repo - Visual Studio Code",
      url: null, domain: null, browserProfile: null, project: "repo",
      isIdle: false, isLocked: false,
    });
    const today = new Date(now).toLocaleDateString("en-CA");
    upsertPlanNote({ category: "Work", date: today, body: "wired up the sync module" });

    r = await syncToGithub({ reason: "check" });
    assert.equal(r.ok, true, `first push failed: ${r.message}`);
    assert.equal(r.pushed, true, "first sync pushes");

    const tree = execFileSync("git", ["ls-tree", "-r", "--name-only", "main"], {
      cwd: bare, encoding: "utf8",
    }).trim().split("\n");
    console.log("  pushed files:\n   ", tree.join("\n    "));

    assert.ok(tree.includes(`events/${today}.json`), "events file pushed");
    assert.ok(tree.includes(`scores/${today}.json`), "scores file pushed");
    assert.ok(tree.includes(`notes/${today}.md`), "notes markdown pushed");
    assert.ok(tree.includes("README.md"), "layout readme pushed");

    const show = (f: string) =>
      execFileSync("git", ["show", `main:${f}`], { cwd: bare, encoding: "utf8" });
    const scores = JSON.parse(show(`scores/${today}.json`));
    assert.ok("productivityScore" in scores && "schedule" in scores, "scores are separated");
    const events = JSON.parse(show(`events/${today}.json`));
    assert.equal(events.events.length, 1, "events carry the raw rows");
    assert.match(show(`notes/${today}.md`), /## Work/, "notes grouped by category");
    // The three kinds must not bleed into each other.
    assert.ok(!("events" in scores), "scores file holds no raw events");

    // Second run with nothing changed must be a no-op, not an empty commit.
    r = await syncToGithub({ reason: "check" });
    assert.equal(r.ok, true);
    assert.equal(r.committed, false, `idempotent re-sync: ${r.message}`);

    const commits = execFileSync("git", ["rev-list", "--count", "main"], {
      cwd: bare, encoding: "utf8",
    }).trim();
    assert.equal(commits, "1", "no empty second commit");

    closeDb();
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log("check-sync: all assertions passed");
    app.exit(0);
  } catch (e) {
    console.error("check-sync FAILED:", e);
    app.exit(1);
  }
});
