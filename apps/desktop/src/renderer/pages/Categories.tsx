import { useEffect, useState } from "react";
import type {
  Category,
  CategoryPatch,
  CategoryRule,
  NewCategory,
  NewCategoryRule,
  RuleMatchType,
} from "@desktop-tracker/shared";
import { CATEGORY_COLORS } from "@desktop-tracker/shared";
import { api } from "../lib/api";

type Tab = "taxonomy" | "rules";

export function Categories() {
  const [tab, setTab] = useState<Tab>("taxonomy");
  return (
    <div className="p-8 space-y-6 max-w-[1200px]">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <p className="text-sm text-slate-500 mt-1">
          Your taxonomy + the deterministic rules used as a baseline before AI
          tagging refines them.
        </p>
      </header>

      <div className="flex gap-2 text-sm">
        {(["taxonomy", "rules"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "px-3 py-1.5 rounded-md border transition-colors " +
              (tab === t
                ? "border-sky-500/50 bg-sky-500/10 text-sky-200"
                : "border-slate-800 hover:bg-slate-800")
            }
          >
            {t === "taxonomy" ? "Taxonomy" : "Rules"}
          </button>
        ))}
      </div>

      {tab === "taxonomy" ? <Taxonomy /> : <Rules />}
    </div>
  );
}

// ----------------- Taxonomy (categories CRUD) -----------------

const EMPTY_NEW: NewCategory = {
  name: "",
  description: "",
  color: "#64748b",
  weight: 0.5,
  isDefault: false,
  isHealthTracked: true,
  targetMinPerDay: 30,
  targetMinPerWeek: null,
};

function Taxonomy() {
  const [cats, setCats] = useState<Category[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<NewCategory>(EMPTY_NEW);
  const [showNew, setShowNew] = useState(false);

  const refresh = async () => {
    setCats(await api.categoriesList());
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onSaveNew = async () => {
    if (!draft.name.trim()) return;
    await api.categoriesCreate(draft);
    setDraft(EMPTY_NEW);
    setShowNew(false);
    await refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">
          Health-tracked categories get a progress bar on Today / Weekly.
          Descriptions are sent to the AI classifier as prompt hints — write
          them so an LLM understands what counts.
        </p>
        <button
          onClick={() => setShowNew((v) => !v)}
          className="px-3 py-1.5 rounded-md border border-slate-800 text-sm hover:bg-slate-800"
        >
          {showNew ? "Cancel" : "+ New category"}
        </button>
      </div>

      {showNew && (
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-5 space-y-3">
          <h3 className="text-sm font-medium text-slate-200">New category</h3>
          <CategoryForm
            value={draft}
            onChange={setDraft}
            onSave={onSaveNew}
            saveLabel="Create"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {cats.map((c) => (
          <CategoryRow
            key={c.id}
            cat={c}
            isEditing={editingId === c.id}
            onEdit={() => setEditingId(c.id)}
            onCancel={() => setEditingId(null)}
            onSave={async (patch) => {
              await api.categoriesUpdate(c.id, patch);
              setEditingId(null);
              await refresh();
            }}
            onDelete={async () => {
              if (!confirm(`Delete category "${c.name}"?`)) return;
              const ok = await api.categoriesDelete(c.id);
              if (!ok) alert("Default categories cannot be deleted.");
              await refresh();
            }}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryRow({
  cat,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  onDelete,
}: {
  cat: Category;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (patch: CategoryPatch) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Category>(cat);
  useEffect(() => setDraft(cat), [cat, isEditing]);

  if (!isEditing) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 flex items-center gap-4">
        <span
          className="h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: cat.color }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-slate-200 font-medium">{cat.name}</span>
            {cat.isDefault && (
              <span className="text-[10px] uppercase tracking-wider text-slate-500 border border-slate-800 rounded px-1.5 py-0.5">
                default
              </span>
            )}
            {cat.isHealthTracked && (
              <span className="text-[10px] uppercase tracking-wider text-sky-300 border border-sky-500/30 rounded px-1.5 py-0.5">
                tracked
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 truncate mt-0.5">
            {cat.description || "(no description)"}
          </div>
        </div>
        <div className="text-xs text-slate-500 tabular-nums shrink-0">
          {cat.targetMinPerDay ? `${cat.targetMinPerDay}m/day` : "—"}
          {" · "}
          {cat.targetMinPerWeek ? `${cat.targetMinPerWeek}m/wk` : "—"}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={onEdit}
            className="px-2.5 py-1 text-xs rounded border border-slate-800 hover:bg-slate-800"
          >
            Edit
          </button>
          {!cat.isDefault && (
            <button
              onClick={() => void onDelete()}
              className="px-2.5 py-1 text-xs rounded border border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-5 space-y-3">
      <CategoryForm
        value={draft}
        onChange={(v) => setDraft({ ...draft, ...v })}
        onSave={async () => {
          const patch: CategoryPatch = {
            name: draft.name,
            description: draft.description,
            color: draft.color,
            weight: draft.weight,
            isHealthTracked: draft.isHealthTracked,
            targetMinPerDay: draft.targetMinPerDay,
            targetMinPerWeek: draft.targetMinPerWeek,
          };
          await onSave(patch);
        }}
        saveLabel="Save"
        onCancel={onCancel}
        disableName={cat.isDefault}
      />
    </div>
  );
}

function CategoryForm({
  value,
  onChange,
  onSave,
  saveLabel,
  onCancel,
  disableName,
}: {
  value: NewCategory | Category;
  onChange: (v: NewCategory) => void;
  onSave: () => Promise<void> | void;
  saveLabel: string;
  onCancel?: () => void;
  disableName?: boolean;
}) {
  const set = (patch: Partial<NewCategory>) =>
    onChange({ ...(value as NewCategory), ...patch });

  return (
    <>
      <div className="grid grid-cols-12 gap-2 text-sm">
        <input
          value={value.name}
          disabled={disableName}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Category name"
          className="col-span-3 bg-slate-950 border border-slate-800 rounded-md px-3 py-2 disabled:opacity-60"
        />
        <input
          value={value.color}
          onChange={(e) => set({ color: e.target.value })}
          className="col-span-2 bg-slate-950 border border-slate-800 rounded-md px-3 py-2 font-mono text-xs"
        />
        <input
          type="number"
          step={0.1}
          min={-1}
          max={1}
          value={value.weight}
          onChange={(e) => set({ weight: Number(e.target.value) })}
          className="col-span-1 bg-slate-950 border border-slate-800 rounded-md px-2 py-2 tabular-nums"
          title="Weight: -1 distracting .. +1 productive"
        />
        <input
          type="number"
          value={value.targetMinPerDay ?? ""}
          onChange={(e) =>
            set({
              targetMinPerDay:
                e.target.value === "" ? null : Number(e.target.value),
            })
          }
          placeholder="min/day"
          className="col-span-2 bg-slate-950 border border-slate-800 rounded-md px-2 py-2 tabular-nums"
        />
        <input
          type="number"
          value={value.targetMinPerWeek ?? ""}
          onChange={(e) =>
            set({
              targetMinPerWeek:
                e.target.value === "" ? null : Number(e.target.value),
            })
          }
          placeholder="min/week"
          className="col-span-2 bg-slate-950 border border-slate-800 rounded-md px-2 py-2 tabular-nums"
        />
        <label className="col-span-2 flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={value.isHealthTracked}
            onChange={(e) => set({ isHealthTracked: e.target.checked })}
          />
          Health-tracked
        </label>
      </div>
      <textarea
        value={value.description}
        onChange={(e) => set({ description: e.target.value })}
        placeholder="Description for the AI classifier — describe what counts in this category."
        rows={3}
        className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-sm"
      />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded border border-slate-800 hover:bg-slate-800"
          >
            Cancel
          </button>
        )}
        <button
          onClick={() => void onSave()}
          className="px-3 py-1.5 text-sm rounded bg-sky-500/20 border border-sky-500/40 text-sky-200 hover:bg-sky-500/30"
        >
          {saveLabel}
        </button>
      </div>
    </>
  );
}

// ----------------- Rules tab (existing deterministic baseline) -----------------

const MATCH_TYPES: RuleMatchType[] = ["exe", "domain", "project", "title_regex"];

function Rules() {
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [draft, setDraft] = useState<NewCategoryRule>({
    matchType: "exe",
    pattern: "",
    category: "Work",
    weight: 1,
    priority: 10,
  });

  const refresh = async () => {
    const [r, c] = await Promise.all([api.rulesList(), api.categoriesList()]);
    setRules(r);
    setCats(c);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onAdd = async () => {
    if (!draft.pattern.trim()) return;
    await api.rulesCreate(draft);
    setDraft({ ...draft, pattern: "" });
    await refresh();
  };

  const categoryNames = cats.length > 0 ? cats.map((c) => c.name) : ["Unclassified"];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-sm font-medium text-slate-200 mb-3">Add rule</h3>
        <div className="grid grid-cols-12 gap-2 text-sm">
          <select
            value={draft.matchType}
            onChange={(e) =>
              setDraft({ ...draft, matchType: e.target.value as RuleMatchType })
            }
            className="col-span-2 bg-slate-950 border border-slate-800 rounded-md px-2 py-2"
          >
            {MATCH_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            value={draft.pattern}
            onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
            placeholder={
              draft.matchType === "exe"
                ? "discord.exe"
                : draft.matchType === "domain"
                ? "youtube.com"
                : draft.matchType === "project"
                ? "payment-api"
                : "title regex"
            }
            className="col-span-4 bg-slate-950 border border-slate-800 rounded-md px-3 py-2"
          />
          <select
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            className="col-span-2 bg-slate-950 border border-slate-800 rounded-md px-2 py-2"
          >
            {categoryNames.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="number"
            step={0.1}
            min={-1}
            max={1}
            value={draft.weight}
            onChange={(e) => setDraft({ ...draft, weight: Number(e.target.value) })}
            className="col-span-1 bg-slate-950 border border-slate-800 rounded-md px-2 py-2 tabular-nums"
          />
          <input
            type="number"
            value={draft.priority}
            onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
            className="col-span-1 bg-slate-950 border border-slate-800 rounded-md px-2 py-2 tabular-nums"
          />
          <button
            onClick={() => void onAdd()}
            disabled={!draft.pattern.trim()}
            className="col-span-2 px-3 py-2 rounded-md bg-sky-500/20 border border-sky-500/40 text-sky-200 hover:bg-sky-500/30 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40">
        <div className="px-5 py-3 border-b border-slate-800 text-sm font-medium text-slate-200 flex justify-between">
          <span>Rules</span>
          <span className="text-slate-500">{rules.length}</span>
        </div>
        <div className="divide-y divide-slate-800/60 max-h-[60vh] overflow-y-auto">
          {rules.map((r) => (
            <div
              key={r.id}
              className="px-5 py-2.5 grid grid-cols-12 gap-3 items-center text-sm"
            >
              <div className="col-span-2 text-slate-500 text-xs tabular-nums">
                pri {r.priority}
              </div>
              <div className="col-span-2 text-slate-400">{r.matchType}</div>
              <div className="col-span-4 text-slate-200 font-mono text-xs truncate">
                {r.pattern}
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: CATEGORY_COLORS[r.category] ?? "#64748b" }}
                />
                <span>{r.category}</span>
              </div>
              <div className="col-span-2 text-right tabular-nums">
                <span
                  className={
                    r.weight > 0
                      ? "text-emerald-400"
                      : r.weight < 0
                      ? "text-rose-400"
                      : "text-slate-400"
                  }
                >
                  {r.weight > 0 ? "+" : ""}
                  {r.weight.toFixed(1)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
