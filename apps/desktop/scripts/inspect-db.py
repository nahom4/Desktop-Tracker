"""Read-only inspection of the running tracker's SQLite DB.

Works standalone (uses Python's built-in sqlite3) so it doesn't fight with
better-sqlite3 being rebuilt for Electron's Node ABI.
"""

from __future__ import annotations
import os
import sqlite3
import sys


def main() -> int:
    default = os.path.join(
        os.environ.get("APPDATA", os.path.expanduser("~")),
        "@desktop-tracker",
        "desktop",
        "data.sqlite",
    )
    db_path = sys.argv[1] if len(sys.argv) > 1 else default
    print(f"db: {db_path}")

    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row

    tables = [r["name"] for r in con.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    )]
    print(f"tables: {', '.join(tables)}")

    rule_count = con.execute("SELECT COUNT(*) c FROM category_rules").fetchone()["c"]
    print(f"category_rules rows: {rule_count}")

    ev_count = con.execute("SELECT COUNT(*) c FROM events").fetchone()["c"]
    print(f"events rows: {ev_count}")

    active = con.execute(
        "SELECT COALESCE(SUM(duration_ms),0) ms FROM events WHERE is_idle=0"
    ).fetchone()["ms"]
    idle = con.execute(
        "SELECT COALESCE(SUM(duration_ms),0) ms FROM events WHERE is_idle=1"
    ).fetchone()["ms"]
    print(f"active={active/1000:.1f}s  idle={idle/1000:.1f}s")

    print("\ntop apps:")
    rows = con.execute(
        """SELECT exe, COUNT(*) sessions, SUM(duration_ms) ms
           FROM events WHERE is_idle=0
           GROUP BY exe ORDER BY ms DESC LIMIT 10"""
    ).fetchall()
    for r in rows:
        print(f"  {r['ms']/1000:7.1f}s  {r['sessions']:>3} sess  {r['exe']}")

    print("\nmost recent 10 sessions:")
    rows = con.execute(
        """SELECT id, exe, title, project, domain, browser_profile,
                  duration_ms, is_idle
           FROM events ORDER BY id DESC LIMIT 10"""
    ).fetchall()
    for r in rows:
        flag = "(idle)" if r["is_idle"] else "      "
        proj = f"[{r['project']}]" if r["project"] else ""
        dom = f"<{r['domain']}>" if r["domain"] else ""
        title = (r["title"] or "")[:55]
        print(
            f"  #{r['id']:>3} {flag} {r['duration_ms']/1000:5.1f}s  "
            f"{r['exe'][:22]:<22} {proj}{dom} {title}"
        )

    if "categories" in tables:
        print("\ncategories:")
        rows = con.execute(
            """SELECT name, is_health_tracked, target_min_per_day,
                      target_min_per_week, weight, color
               FROM categories ORDER BY is_health_tracked DESC, name"""
        ).fetchall()
        for r in rows:
            tracked = "[tracked]" if r["is_health_tracked"] else "         "
            day = f"{r['target_min_per_day']}m/d" if r["target_min_per_day"] else "  -  "
            wk = f"{r['target_min_per_week']}m/w" if r["target_min_per_week"] else "  -  "
            print(
                f"  {tracked} {r['name']:<14} w={r['weight']:+.1f}  "
                f"day={day:<6} week={wk:<6}  {r['color']}"
            )

    if "event_tags" in tables:
        tag_count = con.execute("SELECT COUNT(*) c FROM event_tags").fetchone()["c"]
        print(f"\nevent_tags rows: {tag_count}")
        rows = con.execute(
            """SELECT source, COUNT(*) c FROM event_tags GROUP BY source"""
        ).fetchall()
        for r in rows:
            print(f"  by source: {r['source']}={r['c']}")
        rows = con.execute(
            """SELECT category, source, COUNT(*) c
               FROM event_tags GROUP BY category, source
               ORDER BY c DESC LIMIT 12"""
        ).fetchall()
        if rows:
            print("  top assignments:")
            for r in rows:
                print(f"    {r['c']:>4}× {r['category']:<14} ({r['source']})")

    if "settings" in tables:
        rows = con.execute("SELECT key FROM settings").fetchall()
        if rows:
            print(f"\nsettings keys: {', '.join(r['key'] for r in rows)}")

    con.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
