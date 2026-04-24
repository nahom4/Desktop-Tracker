// Quick read-only inspection of the local SQLite DB written by the running
// tracker. Handy for sanity-checking that the collector → sessionizer → DB
// pipeline is working end-to-end during development.

import Database from "better-sqlite3";
import path from "node:path";
import os from "node:os";

const dbPath =
  process.argv[2] ||
  path.join(os.homedir(), "AppData", "Roaming", "@desktop-tracker", "desktop", "data.sqlite");

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
db.pragma("journal_mode = WAL");

console.log(`db: ${dbPath}`);
const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all();
console.log("tables:", tables.map((t) => t.name).join(", "));

const ruleCount = db.prepare(`SELECT COUNT(*) c FROM category_rules`).get();
console.log(`category_rules rows: ${ruleCount.c}`);

const evCount = db.prepare(`SELECT COUNT(*) c FROM events`).get();
console.log(`events rows: ${evCount.c}`);

const totalActive = db
  .prepare(`SELECT COALESCE(SUM(duration_ms),0) ms FROM events WHERE is_idle=0`)
  .get();
const totalIdle = db
  .prepare(`SELECT COALESCE(SUM(duration_ms),0) ms FROM events WHERE is_idle=1`)
  .get();
console.log(
  `active=${(totalActive.ms / 1000).toFixed(1)}s  idle=${(totalIdle.ms / 1000).toFixed(1)}s`
);

const byApp = db
  .prepare(
    `SELECT exe, COUNT(*) sessions, SUM(duration_ms) ms
     FROM events WHERE is_idle=0 GROUP BY exe ORDER BY ms DESC LIMIT 10`
  )
  .all();
console.log("\ntop apps:");
for (const r of byApp) {
  console.log(`  ${(r.ms / 1000).toFixed(1).padStart(7)}s  ${r.sessions.toString().padStart(3)} sess  ${r.exe}`);
}

const recent = db
  .prepare(
    `SELECT id, exe, title, project, duration_ms, is_idle
     FROM events ORDER BY id DESC LIMIT 8`
  )
  .all();
console.log("\nmost recent 8 sessions:");
for (const e of recent) {
  const flag = e.is_idle ? "(idle)" : "      ";
  const titleShort = (e.title || "").slice(0, 60);
  const proj = e.project ? `[${e.project}]` : "";
  console.log(
    `  #${e.id.toString().padStart(3)} ${flag} ${(e.duration_ms / 1000).toFixed(1).padStart(5)}s  ${e.exe.padEnd(20)} ${proj} ${titleShort}`
  );
}

db.close();
