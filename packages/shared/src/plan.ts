/**
 * Per-category plan notes.
 *
 * One Markdown document per (category, day). Checkboxes, bullets, headings and
 * prose all live in that one document — there is no separate "task" record,
 * because `- [ ] thing` already is one and Markdown edits far better than a
 * list of one-line inputs.
 *
 * Carry-forward works by seeding: when a category has no entry for today, the
 * editor opens pre-filled with the previous day's text, crossed-off boxes and
 * all. You read it, delete what is finished, add what is new, and the moment
 * you type it saves as *today's* entry — leaving the previous day's untouched
 * in the archive.
 */

/** One day's note for one category. At most one row per (category, date). */
export interface PlanNote {
  id: number;
  category: string;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** Markdown. */
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface NewPlanNote {
  category: string;
  date: string;
  body: string;
}

/** What the editor needs to open one category on one day. */
export interface CategoryPlan {
  category: string;
  date: string;
  /** Today's entry, once written. */
  today: PlanNote | null;
  /** Newest entry from an earlier day — seeds the editor when today is empty. */
  previous: PlanNote | null;
}
