/**
 * Weekly report email.
 *
 * Written as table-based HTML with inline styles because that is what mail
 * clients actually render — flexbox, grid and <style> blocks are unreliable
 * across Gmail/Outlook, and bars have to be drawn as nested table cells rather
 * than divs with widths. A plain-text alternative goes alongside for clients
 * that refuse HTML.
 */

import type {
  SchedulePlanCategoryStat,
  WeeklyReport,
} from "@desktop-tracker/shared";

/** Per-category planned vs actual for the week, from `getWeekCategoryStats`. */
export type WeekCategoryStat = SchedulePlanCategoryStat;

const BG = "#0b0d10";
const CARD = "#141920";
const BORDER = "#232b36";
const TEXT = "#e6edf3";
const MUTED = "#8b949e";
const ACCENT = "#58a6ff";
const GOOD = "#22c55e";
const WARN = "#eab308";
const BAD = "#ef4444";

function hours(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function scoreColor(n: number): string {
  if (n >= 75) return GOOD;
  if (n >= 45) return WARN;
  return BAD;
}

function delta(n: number): string {
  if (n === 0) return `<span style="color:${MUTED}">±0</span>`;
  const up = n > 0;
  return `<span style="color:${up ? GOOD : BAD}">${up ? "▲" : "▼"} ${Math.abs(n)}</span>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!
  );
}

/** A progress bar drawn as a two-cell table — the only portable way in email. */
function bar(pct: number, color: string): string {
  const filled = Math.max(0, Math.min(100, Math.round(pct)));
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="border-collapse:separate;border-radius:4px;overflow:hidden;background:#1f2630">
      <tr>
        <td width="${filled}%" style="background:${color};height:8px;font-size:0;line-height:0">&nbsp;</td>
        <td width="${100 - filled}%" style="height:8px;font-size:0;line-height:0">&nbsp;</td>
      </tr>
    </table>`;
}

function statCell(label: string, value: string, sub: string, color = TEXT): string {
  return `
    <td width="25%" valign="top" style="padding:14px 12px;background:${CARD};border:1px solid ${BORDER};border-radius:10px">
      <div style="font:600 10px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:${MUTED}">${esc(label)}</div>
      <div style="font:600 26px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;color:${color};padding-top:4px">${value}</div>
      <div style="font:400 11px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:${MUTED};padding-top:2px">${sub}</div>
    </td>`;
}

/**
 * One labelled bar in the planned-vs-actual pair.
 *
 * The fill is clamped at 100% so the bar never overflows its cell, but the
 * percentage is not — going past the planned time is exactly the thing this
 * section exists to show, so 143% has to read as 143%.
 */
function measuredBar(
  label: string,
  ms: number,
  plannedMs: number,
  color: string
): string {
  const pct = plannedMs > 0 ? Math.round((ms / plannedMs) * 100) : null;
  const over = pct !== null && pct > 100;
  return `
    <tr>
      <td width="66" style="font:400 11px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:${MUTED};padding:3px 0">${esc(label)}</td>
      <td style="padding:3px 8px">${bar(plannedMs > 0 ? (ms / plannedMs) * 100 : 0, color)}</td>
      <td width="104" align="right" style="font:400 11px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:${MUTED};padding:3px 0;white-space:nowrap">
        <strong style="color:${TEXT}">${hours(ms)}</strong>${plannedMs > 0 ? ` / ${hours(plannedMs)}` : ""}
        ${pct !== null ? `&nbsp;<span style="color:${over ? GOOD : MUTED}">${pct}%</span>` : ""}
      </td>
    </tr>`;
}

/**
 * Per category: what the schedule got, then what the category got in total.
 *
 * The second bar is the point — an urgent Work stretch that ran through a
 * Learning block, or hours put in at the weekend, land outside the plan but
 * are still real work in that category. The first bar alone would call that a
 * failure; the pair shows adherence and effort as the separate things they are.
 */
function categoryPlanRows(stats: WeekCategoryStat[]): string {
  if (stats.length === 0) {
    return `<tr><td style="font:400 13px/1.6 -apple-system,sans-serif;color:${MUTED};padding:4px 0">
      Nothing was scheduled this week.</td></tr>`;
  }
  return stats
    .map(
      (s) => `
      <tr><td style="padding:9px 0 0">
        <div style="font:500 13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:${TEXT}">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.color}">&nbsp;</span>
          &nbsp;${esc(s.category)}
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding-top:2px">
          ${measuredBar("scheduled", s.onPlanMs, s.plannedMs, s.color)}
          ${measuredBar("all week", s.actualMs, s.plannedMs, s.color)}
        </table>
      </td></tr>`
    )
    .join("");
}

/** The same pair again, summed — the week in two numbers. */
function categoryTotalRows(stats: WeekCategoryStat[]): string {
  const plannedMs = stats.reduce((t, s) => t + s.plannedMs, 0);
  const onPlanMs = stats.reduce((t, s) => t + s.onPlanMs, 0);
  const actualMs = stats.reduce((t, s) => t + s.actualMs, 0);
  if (plannedMs === 0) return "";
  return `
    ${measuredBar("scheduled", onPlanMs, plannedMs, ACCENT)}
    ${measuredBar("all week", actualMs, plannedMs, ACCENT)}`;
}

function listBlock(title: string, items: string[], color: string): string {
  if (items.length === 0) return "";
  return `
    <tr><td style="padding:10px 0 0">
      <div style="font:600 11px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:${color}">${esc(title)}</div>
      ${items
        .map(
          (i) =>
            `<div style="font:400 13px/1.65 -apple-system,Segoe UI,Roboto,sans-serif;color:${TEXT};padding-top:4px">• ${esc(i)}</div>`
        )
        .join("")}
    </td></tr>`;
}

function dayRows(report: WeeklyReport): string {
  return report.perDay
    .map((d) => {
      const label = new Date(d.periodStart).toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
      });
      const tracked = d.totalActiveMs > 0;
      return `
      <tr>
        <td width="70" style="font:400 12px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:${tracked ? TEXT : MUTED};padding:5px 0">${esc(label)}</td>
        <td style="padding:5px 8px">${bar(d.productivityScore, tracked ? scoreColor(d.productivityScore) : BORDER)}</td>
        <td width="46" align="right" style="font:500 12px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:${tracked ? scoreColor(d.productivityScore) : MUTED};padding:5px 0">${tracked ? d.productivityScore : "—"}</td>
        <td width="66" align="right" style="font:400 12px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:${MUTED};padding:5px 0">${tracked ? hours(d.totalActiveMs) : ""}</td>
      </tr>`;
    })
    .join("");
}

function topRows(buckets: { label: string; durationMs: number }[], max = 6): string {
  const items = buckets.slice(0, max);
  if (items.length === 0) {
    return `<tr><td style="font:400 13px/1.6 -apple-system,sans-serif;color:${MUTED}">Nothing recorded.</td></tr>`;
  }
  const top = items[0]!.durationMs || 1;
  return items
    .map(
      (b) => `
      <tr>
        <td style="font:400 13px/1.7 -apple-system,Segoe UI,Roboto,sans-serif;color:${TEXT};padding:3px 0">${esc(b.label)}</td>
        <td width="120" style="padding:3px 8px">${bar((b.durationMs / top) * 100, ACCENT)}</td>
        <td width="60" align="right" style="font:400 12px/1.7 -apple-system,Segoe UI,Roboto,sans-serif;color:${MUTED};padding:3px 0">${hours(b.durationMs)}</td>
      </tr>`
    )
    .join("");
}

function section(title: string, inner: string): string {
  return `
  <tr><td style="padding:18px 0 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${CARD};border:1px solid ${BORDER};border-radius:10px">
      <tr><td style="padding:16px 18px">
        <div style="font:600 12px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};padding-bottom:8px">${esc(title)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${inner}</table>
      </td></tr>
    </table>
  </td></tr>`;
}

export function renderWeeklyReportEmail(
  report: WeeklyReport,
  categoryStats: WeekCategoryStat[] = []
): {
  subject: string;
  html: string;
  text: string;
} {
  const range = `${report.weekStart} → ${report.weekEnd}`;
  const subject = `Weekly report ${range} — productivity ${report.averageProductivityScore}, focus ${report.averageFocusScore}`;
  const ai = report.aiReview;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${BG}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%">

  <tr><td style="padding-bottom:16px">
    <div style="font:600 20px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:${TEXT}">Your week</div>
    <div style="font:400 13px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:${MUTED}">${esc(range)}</div>
  </td></tr>

  <tr><td>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="6" border="0">
      <tr>
        ${statCell("Productivity", String(report.averageProductivityScore), `${delta(report.productivityScoreDelta)} vs last week`, scoreColor(report.averageProductivityScore))}
        ${statCell("Focus", String(report.averageFocusScore), `${delta(report.focusScoreDelta)} vs last week`, scoreColor(report.averageFocusScore))}
      </tr>
      <tr>
        ${statCell("Deep work", `${report.deepWorkHours}h`, "uninterrupted blocks")}
        ${statCell("Active", hours(report.totalActiveMs), `${hours(report.totalIdleMs)} idle`)}
      </tr>
    </table>
  </td></tr>

  ${
    ai
      ? `<tr><td style="padding:18px 0 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${CARD};border:1px solid ${BORDER};border-left:3px solid ${ACCENT};border-radius:10px">
      <tr><td style="padding:16px 18px">
        <div style="font:400 15px/1.65 -apple-system,Segoe UI,Roboto,sans-serif;color:${TEXT}">${esc(ai.summary)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${listBlock("What went well", ai.wins, GOOD)}
          ${listBlock("What slipped", ai.misses, WARN)}
        </table>
        <div style="margin-top:14px;padding:10px 12px;background:#0f1520;border-radius:6px">
          <div style="font:600 10px/1.4 -apple-system,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:${ACCENT}">Do this next week</div>
          <div style="font:400 13px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:${TEXT};padding-top:3px">${esc(ai.recommendation)}</div>
        </div>
      </td></tr>
    </table>
  </td></tr>`
      : ""
  }

  ${section("Category time — scheduled vs all week", categoryPlanRows(categoryStats))}
  ${section("All categories combined", categoryTotalRows(categoryStats))}
  ${section("Productivity by day", dayRows(report))}
  ${section("Where the time went", topRows(report.breakdown.byCategory))}
  ${section("Top apps", topRows(report.breakdown.byApp))}
  ${
    report.topDistractions.length > 0
      ? section("Biggest distractions", topRows(report.topDistractions, 5))
      : ""
  }

  ${
    report.oneChange
      ? `<tr><td style="padding:18px 0 0">
      <div style="background:#1c1608;border:1px solid #463505;border-radius:10px;padding:14px 16px;
                  font:400 13px/1.65 -apple-system,Segoe UI,Roboto,sans-serif;color:#fde68a">
        <strong>One change:</strong> ${esc(report.oneChange)}
      </div></td></tr>`
      : ""
  }

  <tr><td style="padding:20px 2px 0;font:400 11px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#5b6673">
    Desktop Tracker · generated locally on your machine · data never leaves your device except this email
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  const text = [
    `Your week — ${range}`,
    "",
    `Productivity ${report.averageProductivityScore} (${report.productivityScoreDelta >= 0 ? "+" : ""}${report.productivityScoreDelta})`,
    `Focus        ${report.averageFocusScore} (${report.focusScoreDelta >= 0 ? "+" : ""}${report.focusScoreDelta})`,
    `Deep work    ${report.deepWorkHours}h`,
    `Active       ${hours(report.totalActiveMs)} (${hours(report.totalIdleMs)} idle)`,
    "",
    ...(ai
      ? [
          ai.summary,
          "",
          ...(ai.wins.length ? ["Went well:", ...ai.wins.map((w) => `  • ${w}`)] : []),
          ...(ai.misses.length ? ["Slipped:", ...ai.misses.map((m) => `  • ${m}`)] : []),
          "",
          `Next week: ${ai.recommendation}`,
          "",
        ]
      : []),
    ...(categoryStats.length
      ? [
          "Scheduled vs all week:",
          ...categoryStats.map(
            (s) =>
              `  ${s.category.padEnd(14)} scheduled ${hours(s.onPlanMs)} / ${hours(s.plannedMs)}` +
              `   all week ${hours(s.actualMs)}`
          ),
          "",
        ]
      : []),
    "Where the time went:",
    ...report.breakdown.byCategory
      .slice(0, 6)
      .map((b) => `  ${b.label.padEnd(16)} ${hours(b.durationMs)}`),
    ...(report.oneChange ? ["", `One change: ${report.oneChange}`] : []),
  ].join("\n");

  return { subject, html, text };
}
