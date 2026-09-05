import { useEffect, useMemo, useState } from "react";
import type {
  Category,
  DayOfWeek,
  ResolvedScheduleBlock,
} from "@desktop-tracker/shared";
import { DAY_NAMES } from "@desktop-tracker/shared";
import { formatMinuteOfDay, parseMinuteOfDay } from "@desktop-tracker/analysis";
import type { BlockDraft, SaveScope } from "../pages/Schedule";

export type EditorTarget =
  | { mode: "create"; date: string; dayOfWeek: DayOfWeek }
  | {
      mode: "edit";
      date: string;
      dayOfWeek: DayOfWeek;
      block: ResolvedScheduleBlock;
    };

interface Props {
  target: EditorTarget;
  categories: Category[];
  busy: boolean;
  onCancel: () => void;
  onSave: (draft: BlockDraft, scope: SaveScope) => void;
  onDelete: (scope: SaveScope) => void;
}

export function ScheduleBlockEditor({
  target,
  categories,
  busy,
  onCancel,
  onSave,
  onDelete,
}: Props) {
  const existing = target.mode === "edit" ? target.block : null;

  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(target.dayOfWeek);
  const [start, setStart] = useState(formatMinuteOfDay(existing?.startMin ?? 9 * 60));
  const [end, setEnd] = useState(formatMinuteOfDay(existing?.endMin ?? 10 * 60));
  const [title, setTitle] = useState(existing?.title ?? "");
  const [category, setCategory] = useState(
    existing?.category ?? categories[0]?.name ?? "Work"
  );
  const [isPrimary, setIsPrimary] = useState(existing?.isPrimary ?? false);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  // Recurring is the default: the plan is a weekly routine, and a one-off is
  // the deliberate exception.
  const [scope, setScope] = useState<SaveScope>("weekly");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const startMin = parseMinuteOfDay(start);
  const endMin = parseMinuteOfDay(end);

  const problem = useMemo(() => {
    if (!title.trim()) return "Give the block a title.";
    if (startMin === null) return `"${start}" is not a valid time.`;
    if (endMin === null) return `"${end}" is not a valid time.`;
    if (endMin <= startMin) return "The end time must be after the start time.";
    if (!category) return "Pick a category.";
    return null;
  }, [title, start, end, startMin, endMin, category]);

  // Moving a block to a different weekday is a change to the routine itself —
  // there is no coherent "just this week" version of it.
  const dayChanged = dayOfWeek !== target.dayOfWeek;
  const onceDisabled = dayChanged;
  const effectiveScope: SaveScope = onceDisabled ? "weekly" : scope;

  const dateLabel = new Date(`${target.date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const submit = () => {
    if (problem || startMin === null || endMin === null) return;
    onSave(
      {
        dayOfWeek,
        startMin,
        endMin,
        title: title.trim(),
        category,
        isPrimary,
        notes: notes.trim() || null,
      },
      effectiveScope
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70 p-6"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border-strong bg-surface p-6 space-y-4 shadow-2xl max-h-full overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-semibold text-text">
            {target.mode === "create" ? "New block" : "Edit block"}
          </h2>
          <p className="text-xs text-subtle mt-0.5">{dateLabel}</p>
        </div>

        <Field label="Title">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Bible study"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Day">
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value) as DayOfWeek)}
              className={inputClass}
            >
              {DAY_NAMES.map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start">
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="End">
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Category">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputClass}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-subtle mt-1">
            Time inside this block only counts as on-plan when your tracked
            activity lands in this category.
          </p>
        </Field>

        <label className="flex items-start gap-2.5 rounded-lg border border-border bg-bg/40 px-3 py-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-sm text-text">
            ★ Most important task of the day
            <span className="block text-xs text-subtle mt-0.5">
              Required — every planned day needs exactly one. It counts double
              when scoring how well you kept to the plan, and marking this one
              un-stars whichever block currently holds it.
            </span>
          </span>
        </label>

        <Field label="Notes (optional)">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Deep work — no Slack"
            className={inputClass}
          />
        </Field>

        <fieldset className="rounded-lg border border-border p-3 space-y-2">
          <legend className="px-1 text-xs uppercase tracking-wider text-subtle">
            Apply to
          </legend>
          <ScopeOption
            checked={effectiveScope === "weekly"}
            onChange={() => setScope("weekly")}
            title={`Every ${DAY_NAMES[dayOfWeek]}`}
            hint="Changes the repeating plan from now on."
          />
          <ScopeOption
            checked={effectiveScope === "once"}
            onChange={() => setScope("once")}
            disabled={onceDisabled}
            title={`Just ${dateLabel}`}
            hint={
              onceDisabled
                ? "Not available — moving a block to another weekday changes the routine."
                : "Leaves every other week untouched."
            }
          />
        </fieldset>

        {problem && <p className="text-sm text-warn">{problem}</p>}

        <div className="flex items-center justify-between gap-3 pt-1">
          {target.mode === "edit" ? (
            <button
              onClick={() => onDelete(effectiveScope)}
              disabled={busy}
              className="px-3 py-1.5 rounded-md border border-bad/60 text-sm text-bad hover:bg-bad-soft/40 disabled:opacity-50"
            >
              {target.block.blockId == null || effectiveScope === "weekly"
                ? "Delete"
                : "Skip this day"}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              disabled={busy}
              className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-elevate disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={busy || problem !== null}
              className="px-3 py-1.5 rounded-md border border-accent/50 bg-accent/10 text-sm text-accent hover:bg-accent/20 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-border-strong bg-bg px-2.5 py-1.5 text-sm text-text focus:border-accent focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-subtle mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function ScopeOption({
  checked,
  onChange,
  title,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={
        "flex items-start gap-2.5 " + (disabled ? "opacity-50" : "cursor-pointer")
      }
    >
      <input
        type="radio"
        name="schedule-scope"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-0.5"
      />
      <span className="text-sm text-text">
        {title}
        <span className="block text-xs text-subtle">{hint}</span>
      </span>
    </label>
  );
}
