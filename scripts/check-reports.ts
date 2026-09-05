/**
 * Self-check for daily-report catch-up. Run with `npm run check:reports`.
 *
 * The 23:55 tick only fires if the app is awake at that exact minute, so a
 * closed laptop used to lose the day's report permanently. Catch-up fills the
 * gap on the next launch — which makes three properties worth pinning down:
 *
 *   1. a finished day with activity and no report gets one,
 *   2. running it again generates nothing (it runs hourly — duplicates would
 *      pile up fast),
 *   3. days with no tracked activity are skipped rather than given an empty
 *      report for a day the machine was off.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app } from "electron";
import {
  closeDb,
  getDb,
  insertEvent,
  openDb,
  seedDefaultCategoriesIfMissing,
  seedDefaultRulesIfEmpty,
  setSetting,
} from "../apps/desktop/src/main/db";
import { catchUpReports } from "../apps/desktop/src/main/scheduler";
import { startOfLocalDay } from "../packages/analysis/src/index";

const DAY_MS = 86_400_000;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dt-reports-"));
app.setPath("userData", dir);

void app.whenReady().then(async () => {
  try {
    openDb(path.join(dir, "data.sqlite"));
    seedDefaultRulesIfEmpty();
    seedDefaultCategoriesIfMissing();
    // Offline + silent: no AI call, no notification, no push.
    setSetting("groq_api_key", "");
    setSetting(
      "notification_config",
      JSON.stringify({ osEnabled: false, emailEnabled: false })
    );

    const today = startOfLocalDay(Date.now());
    const twoDaysAgo = startOfLocalDay(today - 1.5 * DAY_MS);

    // One finished day with real activity, and nothing on any other day.
    insertEvent({
      startTs: twoDaysAgo + 10 * 3_600_000,
      endTs: twoDaysAgo + 10 * 3_600_000 + 1_800_000,
      durationMs: 1_800_000,
      exe: "code",
      exePath: "/usr/bin/code",
      title: "index.ts - repo - Visual Studio Code",
      url: null,
      domain: null,
      browserProfile: null,
      project: "repo",
      isIdle: false,
      isLocked: false,
    });

    const reportCount = () =>
      (getDb().prepare("SELECT COUNT(*) c FROM reports").get() as { c: number }).c;

    assert.equal(reportCount(), 0, "starts with no reports");

    const made = await catchUpReports();
    assert.equal(made, 1, "the one day with activity gets a report");
    assert.equal(reportCount(), 1, "and exactly one row is written");

    const row = getDb()
      .prepare("SELECT kind, period_start, payload FROM reports")
      .get() as { kind: string; period_start: number; payload: string };
    assert.equal(row.kind, "daily");
    assert.equal(row.period_start, twoDaysAgo, "report is filed under the right day");
    const payload = JSON.parse(row.payload);
    assert.ok(
      typeof payload.productivityScore === "number" && payload.breakdown,
      "payload is a real report, not a stub"
    );

    // Runs hourly: a second pass must be a no-op.
    assert.equal(await catchUpReports(), 0, "second pass generates nothing");
    assert.equal(reportCount(), 1, "no duplicate row");

    // Today is not finished, so it must never be reported on early.
    insertEvent({
      startTs: today + 9 * 3_600_000,
      endTs: today + 9 * 3_600_000 + 600_000,
      durationMs: 600_000,
      exe: "code",
      exePath: "/usr/bin/code",
      title: "today.ts - repo - Visual Studio Code",
      url: null,
      domain: null,
      browserProfile: null,
      project: "repo",
      isIdle: false,
      isLocked: false,
    });
    assert.equal(await catchUpReports(), 0, "today is never caught up while it runs");

    closeDb();
    fs.rmSync(dir, { recursive: true, force: true });
    console.log("check-reports: all assertions passed");
    app.exit(0);
  } catch (e) {
    console.error("check-reports FAILED:", e);
    app.exit(1);
  }
});
