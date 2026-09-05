export type Page =
  | "today"
  | "schedule"
  | "notes"
  | "timeline"
  | "weekly"
  | "reports"
  | "categories"
  | "settings";

interface NavItem {
  id: Page;
  label: string;
  icon: string;
}

const NAV: NavItem[] = [
  { id: "today", label: "Today", icon: "◉" },
  { id: "schedule", label: "Schedule", icon: "▤" },
  { id: "notes", label: "Notes", icon: "✎" },
  { id: "timeline", label: "Timeline", icon: "☰" },
  { id: "weekly", label: "Weekly", icon: "▦" },
  { id: "reports", label: "Reports", icon: "◧" },
  { id: "categories", label: "Categories", icon: "◈" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

export function Sidebar({
  current,
  onNavigate,
}: {
  current: Page;
  onNavigate: (p: Page) => void;
}) {
  return (
    <aside className="w-56 shrink-0 border-r border-border bg-surface/40 flex flex-col">
      <div className="px-5 py-5 border-b border-border">
        <div className="text-base font-semibold tracking-tight">Desktop Tracker</div>
        <div className="text-xs text-subtle mt-0.5">Local • Private</div>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-1">
        {NAV.map((n) => {
          const active = current === n.id;
          return (
            <button
              key={n.id}
              onClick={() => onNavigate(n.id)}
              className={
                "w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-3 transition-colors " +
                (active
                  ? "bg-elevate text-text"
                  : "text-muted hover:text-text hover:bg-elevate/60")
              }
            >
              <span className="text-subtle w-4 text-center">{n.icon}</span>
              <span>{n.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="px-4 py-3 border-t border-border text-xs text-subtle">
        v0.0.1
      </div>
    </aside>
  );
}
