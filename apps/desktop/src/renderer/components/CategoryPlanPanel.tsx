import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import type { CategoryPlan } from "@desktop-tracker/shared";
import { api } from "../lib/api";

/**
 * Markdown editor for one category's note on one day.
 *
 * Everything lives in the one document — `- [ ]` for a task, `-` for a bullet,
 * headings and prose for the rest. Preview renders it, and checkboxes stay
 * clickable there: ticking one rewrites that box in the source text, so you can
 * work from the rendered view without switching back to edit.
 *
 * When today has no entry yet, the editor opens seeded with the previous day's
 * text. Nothing is written until you type, so the older entry stays intact in
 * the archive and today's becomes its own row the moment you edit.
 */
export function CategoryPlanPanel({
  category,
  date,
  compact = false,
}: {
  category: string;
  /** Local YYYY-MM-DD; defaults to today. */
  date?: string;
  compact?: boolean;
}) {
  const [plan, setPlan] = useState<CategoryPlan | null>(null);
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  /** True while showing carried-over text that has not been saved as today's. */
  const [carried, setCarried] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ category: string; date: string; body: string } | null>(null);

  const load = useCallback(async () => {
    const p = await api.planForCategory(category, date);
    setPlan(p);
    if (p.today) {
      setBody(p.today.body);
      setCarried(false);
    } else if (p.previous) {
      setBody(p.previous.body);
      setCarried(true);
    } else {
      setBody("");
      setCarried(false);
    }
  }, [category, date]);

  useEffect(() => {
    void load();
  }, [load]);

  // Switching category must not swallow a debounced edit — flush it.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const p = pending.current;
      pending.current = null;
      if (p) void api.planNoteSave(p);
    };
  }, [category, date]);

  const write = (next: string) => {
    setBody(next);
    setCarried(false);
    setSaved("saving");
    if (!plan) return;
    const payload = { category, date: plan.date, body: next };
    pending.current = payload;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      pending.current = null;
      await api.planNoteSave(payload);
      setSaved("saved");
      setTimeout(() => setSaved("idle"), 1500);
    }, 600);
  };

  const html = useMemo(() => {
    if (mode !== "preview") return "";
    // Local-only content, but rendering raw HTML from a document that syncs to
    // a repo buys nothing and costs a scripting surface — so markdown only.
    const out = marked.parse(body || "_Nothing written yet._", {
      async: false,
      gfm: true,
      breaks: true,
    }) as string;
    // marked emits task-list boxes as `disabled`, and a disabled input fires no
    // click event — which would make the preview's checkboxes dead. Enable them
    // so ticking one can write back into the source.
    return out.replace(/ disabled=""/g, "");
  }, [body, mode]);

  /**
   * Toggle the nth `- [ ]` / `- [x]` in the source. The preview renders
   * checkboxes in document order, so the index from the click maps straight
   * onto the nth match here.
   */
  const toggleCheckbox = (index: number) => {
    let seen = -1;
    const next = body.replace(/^(\s*[-*]\s+)\[([ xX])\]/gm, (whole, prefix, mark) => {
      seen++;
      if (seen !== index) return whole;
      return `${prefix}[${mark === " " ? "x" : " "}]`;
    });
    if (next !== body) write(next);
  };

  if (!plan) return <div className="text-xs text-subtle">Loading…</div>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded border border-border overflow-hidden">
          {(["write", "preview"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={
                "px-2.5 py-1 text-xs capitalize transition-colors " +
                (mode === m
                  ? "bg-elevate text-text"
                  : "text-subtle hover:text-text")
              }
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs">
          {carried && plan.previous && (
            <span className="text-warn/80">
              carried over from {plan.previous.date} — edit to make it today's
            </span>
          )}
          {saved !== "idle" && (
            <span className="text-subtle">
              {saved === "saving" ? "saving…" : "saved"}
            </span>
          )}
          <span className="text-faint tabular-nums">{plan.date}</span>
        </div>
      </div>

      {mode === "write" ? (
        <textarea
          value={body}
          onChange={(e) => write(e.target.value)}
          rows={compact ? 10 : 20}
          spellCheck
          placeholder={"## What I'm doing\n\n- [ ] a task\n- a bullet\n\nNotes in plain markdown."}
          className="w-full bg-bg/60 border border-border rounded px-3 py-2 text-sm text-text placeholder:text-faint focus:outline-none focus:border-border-strong resize-y font-mono leading-relaxed"
        />
      ) : (
        <div
          onClick={(e) => {
            const el = e.target as HTMLElement;
            if (el instanceof HTMLInputElement && el.type === "checkbox") {
              const boxes = Array.from(
                e.currentTarget.querySelectorAll('input[type="checkbox"]')
              );
              toggleCheckbox(boxes.indexOf(el));
            }
          }}
          className="markdown-body min-h-[8rem] bg-bg/40 border border-border rounded px-3 py-2 text-sm text-text"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}
