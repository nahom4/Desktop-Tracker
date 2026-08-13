/**
 * Self-check for the per-category plan notes. Run with `npm run check:plan`.
 *
 * Guards the rules that are easy to regress and expensive to notice: the
 * carry-forward must find the *previous* day rather than today's and must not
 * leak across categories, re-saving a day must replace rather than append, and
 * the retired plan_items table must fold into notes without losing text.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  closeDb,
  getPlanNote,
  getPreviousPlanNote,
  listPlanNotes,
  migratePlanItemsIntoNotes,
  openDb,
  upsertPlanNote,
} from "../apps/desktop/src/main/db";

const dbPath = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "dt-check-")),
  "check.sqlite"
);
openDb(dbPath);

// ---- notes: one per (category, day), previous day carried forward ----
upsertPlanNote({ category: "Work", date: "2026-08-11", body: "shipped the sync module" });
upsertPlanNote({ category: "Work", date: "2026-08-12", body: "started the plan panel" });
upsertPlanNote({ category: "Learning", date: "2026-08-12", body: "borrow checker" });

assert.equal(
  getPreviousPlanNote("Work", "2026-08-13")?.date,
  "2026-08-12",
  "carry-forward picks the newest earlier day"
);
assert.equal(
  getPreviousPlanNote("Work", "2026-08-12")?.date,
  "2026-08-11",
  "carry-forward is strictly before the given date, never the same day"
);
assert.equal(
  getPreviousPlanNote("Work", "2026-08-11"),
  null,
  "no earlier note yields null"
);
assert.equal(
  getPreviousPlanNote("Religion", "2026-08-13"),
  null,
  "carry-forward does not leak across categories"
);

upsertPlanNote({ category: "Work", date: "2026-08-12", body: "revised" });
assert.equal(
  listPlanNotes("Work").length,
  2,
  "re-saving the same day replaces rather than appends"
);
assert.equal(getPlanNote("Work", "2026-08-12")?.body, "revised", "replacement wins");

upsertPlanNote({ category: "Work", date: "2026-08-12", body: "   " });
assert.equal(getPlanNote("Work", "2026-08-12"), null, "an emptied note is deleted");

// ---- retired plan_items fold into notes ----
// Recreate the old table, populate it, and confirm the migration preserves
// every line as Markdown rather than dropping the user's text on the floor.
const d = openDb(dbPath); // already open; returns the same handle
d.exec(`
  CREATE TABLE IF NOT EXISTS plan_items (
    id INTEGER PRIMARY KEY, category TEXT NOT NULL, kind TEXT NOT NULL,
    text TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, done_at INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);
const ins = d.prepare(
  `INSERT INTO plan_items (category, kind, text, done, sort_order, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, 0, 0)`
);
ins.run("Learning", "task", "Learn about how desktop tracker works", 0, 0);
ins.run("Learning", "task", "finished thing", 1, 1);
ins.run("Learning", "bullet", "a bare bullet", 0, 2);

migratePlanItemsIntoNotes();

const todayKey = new Date().toLocaleDateString("en-CA");
const folded = getPlanNote("Learning", todayKey);
assert.ok(folded, "migration wrote a note for the item's category");
assert.match(folded.body, /- \[ \] Learn about how desktop tracker works/, "open task became an unchecked box");
assert.match(folded.body, /- \[x\] finished thing/, "done task became a checked box");
assert.match(folded.body, /^- a bare bullet$/m, "bullet became a plain list item");
assert.equal(
  d.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='plan_items'`).get(),
  undefined,
  "the retired table is dropped"
);
migratePlanItemsIntoNotes(); // idempotent: no table, no throw

closeDb();
fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
console.log("check-plan: all assertions passed");
