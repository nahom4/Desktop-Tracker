import { useEffect, useState } from "react";
import type { Category, NotificationConfig } from "@desktop-tracker/shared";
import type { AiStatus, ApiKeyStatus, GithubSyncConfigView } from "../../preload";
import { api } from "../lib/api";
import { formatDuration } from "../lib/format";
import {
  getTextSize,
  getTheme,
  setTextSize,
  setTheme,
  type TextSize,
  type Theme,
} from "../lib/appearance";

function isApiKeyStatus(v: unknown): v is ApiKeyStatus {
  return !!v && typeof v === "object" && "hasValue" in (v as object);
}

export function Settings() {
  const [keyStatus, setKeyStatus] = useState<ApiKeyStatus | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [model, setModel] = useState("llama-3.3-70b-versatile");
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refreshStatus = async () => {
    setAiStatus(await api.aiStatus());
  };

  const refreshAll = async () => {
    const [k, e, m] = await Promise.all([
      api.settingsGet("groq_api_key"),
      api.settingsGet("ai_tagging_enabled"),
      api.settingsGet("ai_model"),
    ]);
    if (isApiKeyStatus(k)) setKeyStatus(k);
    else setKeyStatus(null);
    setEnabled(e === null ? true : e === "1");
    if (typeof m === "string" && m) setModel(m);
    await refreshStatus();
  };

  useEffect(() => {
    void refreshAll();
    const t = setInterval(refreshStatus, 5000);
    return () => clearInterval(t);
  }, []);

  const saveKey = async () => {
    if (!keyInput.trim()) return;
    setBusy(true);
    try {
      await api.settingsSet("groq_api_key", keyInput.trim());
      setKeyInput("");
      setMsg("Key saved.");
      await refreshAll();
    } finally {
      setBusy(false);
    }
  };

  const clearKey = async () => {
    if (!confirm("Remove the Groq API key from this app?")) return;
    setBusy(true);
    try {
      await api.settingsSet("groq_api_key", "");
      setMsg("Key removed.");
      await refreshAll();
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async (next: boolean) => {
    setEnabled(next);
    await api.settingsSet("ai_tagging_enabled", next ? "1" : "0");
    await refreshStatus();
  };

  const runNow = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.aiRunNow();
      setMsg(
        res.tagged > 0
          ? `Tagged ${res.tagged} event${res.tagged === 1 ? "" : "s"}.`
          : `No tagging: ${res.reason ?? "unknown"}.`
      );
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-[900px]">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-subtle mt-1">
          Tracker behaviour, AI tagging, and privacy.
        </p>
      </header>

      <AppearanceSection />

      <section className="rounded-xl border border-border bg-surface/40 p-5 space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-text">AI tagging (Groq)</h3>
          <span className="text-xs text-subtle">llama-3.1-8b-instant by default</span>
        </div>
        <p className="text-sm text-subtle">
          With AI tagging on, every active event with a meaningful title is
          classified into your category taxonomy in batches every 2 minutes.
          Your key is stored only in the local SQLite database in your AppData
          folder.
        </p>

        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-9 flex items-center gap-2 px-3 py-2 rounded border border-border bg-bg font-mono text-xs">
            {keyStatus?.hasValue ? (
              <>
                <span className="text-good">●</span>
                <span className="text-muted">Saved key</span>
                <span className="text-text ml-2">{keyStatus.preview}</span>
              </>
            ) : (
              <>
                <span className="text-bad">●</span>
                <span className="text-subtle">No key configured</span>
              </>
            )}
          </div>
          {keyStatus?.hasValue && (
            <button
              onClick={() => void clearKey()}
              disabled={busy}
              className="col-span-3 px-3 py-2 rounded border border-bad/30 text-bad hover:bg-bad/10 text-sm disabled:opacity-40"
            >
              Remove key
            </button>
          )}
        </div>

        <div className="grid grid-cols-12 gap-2">
          <input
            type="password"
            autoComplete="off"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="gsk_… paste a fresh Groq API key"
            className="col-span-9 bg-bg border border-border rounded-md px-3 py-2 text-sm font-mono"
          />
          <button
            onClick={() => void saveKey()}
            disabled={busy || !keyInput.trim()}
            className="col-span-3 px-3 py-2 rounded bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30 text-sm disabled:opacity-40"
          >
            Save key
          </button>
        </div>

        <div className="grid grid-cols-12 gap-2 items-center text-sm">
          <label className="col-span-6 flex items-center gap-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => void toggleEnabled(e.target.checked)}
            />
            <span>Enable AI tagging</span>
          </label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            onBlur={() => void api.settingsSet("ai_model", model)}
            placeholder="llama-3.3-70b-versatile"
            title="Groq model for event classification (70B recommended)"
            className="col-span-4 bg-bg border border-border rounded-md px-2 py-1.5 font-mono text-xs"
          />
          <button
            onClick={() => void runNow()}
            disabled={busy || !keyStatus?.hasValue || !enabled}
            className="col-span-2 px-3 py-1.5 rounded border border-border hover:bg-elevate text-sm disabled:opacity-40"
          >
            Run now
          </button>
        </div>

        {aiStatus && (
          <div className="grid grid-cols-2 gap-2 text-xs text-subtle pt-2 border-t border-border">
            <div>
              Status:{" "}
              <span className="text-text">
                {aiStatus.running
                  ? "running"
                  : aiStatus.enabled && aiStatus.hasKey
                  ? "idle"
                  : "off"}
              </span>
            </div>
            <div>
              Last tagged:{" "}
              <span className="text-text">{aiStatus.lastTagged}</span>
              {aiStatus.lastRunAt && (
                <span className="text-subtle ml-2">
                  at{" "}
                  {new Date(aiStatus.lastRunAt).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
            {aiStatus.lastError && (
              <div className="col-span-2 text-bad">
                Last error: {aiStatus.lastError}
              </div>
            )}
          </div>
        )}

        {msg && <div className="text-sm text-good">{msg}</div>}
      </section>

      <NotificationSection />

      <GithubSyncSection />

      <section className="rounded-xl border border-border bg-surface/40 p-5">
        <h3 className="text-sm font-medium text-text mb-3">Tracking</h3>
        <ul className="text-sm text-muted space-y-2">
          <li>Idle threshold: <span className="text-text">60 seconds</span></li>
          <li>Heartbeat interval: <span className="text-text">1 second</span></li>
          <li>Pause tracking: <span className="text-subtle">(coming in v0.5)</span></li>
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-surface/40 p-5">
        <h3 className="text-sm font-medium text-text mb-3">Reports</h3>
        <ul className="text-sm text-muted space-y-2">
          <li>Daily report: <span className="text-text">23:55 local</span></li>
          <li>Weekly report: <span className="text-text">Sunday 21:00 local</span></li>
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-surface/40 p-5">
        <h3 className="text-sm font-medium text-text mb-3">Privacy</h3>
        <ul className="text-sm text-muted space-y-2">
          <li>All activity data + API key + SMTP password live in <code className="text-text">%APPDATA%</code>.</li>
          <li>Incognito / private browsing windows are skipped.</li>
          <li>AI tagging sends window titles + URLs + app names to Groq — review their privacy policy before enabling.</li>
        </ul>
      </section>
    </div>
  );
}

/**
 * Server settings for the common providers, so email setup is two fields
 * (address + app password) rather than six. Every one of these needs an app
 * password rather than the account password — that is the step people miss.
 */
const SMTP_PRESETS: {
  label: string;
  host: string;
  port: number;
  secure: boolean;
  help?: string;
}[] = [
  {
    label: "Gmail",
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    help: "needs 2FA on, then myaccount.google.com/apppasswords",
  },
  {
    label: "Outlook",
    host: "smtp-mail.outlook.com",
    port: 587,
    secure: false,
    help: "account.live.com/proofs/AppPassword",
  },
  {
    label: "Yahoo",
    host: "smtp.mail.yahoo.com",
    port: 465,
    secure: true,
    help: "generate an app password in account security",
  },
  {
    label: "Fastmail",
    host: "smtp.fastmail.com",
    port: 465,
    secure: true,
    help: "app password with SMTP access",
  },
];

// ----------------- Appearance -----------------

const THEMES: { id: Theme; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

const SIZES: { id: TextSize; label: string }[] = [
  { id: "small", label: "Small" },
  { id: "default", label: "Default" },
  { id: "large", label: "Large" },
];

function AppearanceSection() {
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const [size, setSizeState] = useState<TextSize>(getTextSize());

  return (
    <section className="rounded-xl border border-border bg-surface/40 p-5 space-y-4">
      <h3 className="text-sm font-medium text-text">Appearance</h3>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-subtle mb-1.5">Theme</div>
          <SegmentedControl
            options={THEMES}
            value={theme}
            onChange={(v) => {
              setThemeState(v);
              setTheme(v);
            }}
          />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-subtle mb-1.5">
            Text size
          </div>
          <SegmentedControl
            options={SIZES}
            value={size}
            onChange={(v) => {
              setSizeState(v);
              setTextSize(v);
            }}
          />
        </div>
      </div>
      <p className="text-xs text-subtle">
        Text size scales the entire interface, not just the type — spacing and
        controls grow with it. System follows your desktop&apos;s light/dark setting.
      </p>
    </section>
  );
}

/** Small segmented button group — used for both controls above. */
function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={
            "px-3 py-1.5 text-sm transition-colors " +
            (value === o.id
              ? "bg-accent text-accent-ink"
              : "text-muted hover:text-text hover:bg-elevate")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ----------------- GitHub sync section -----------------

function GithubSyncSection() {
  const [cfg, setCfg] = useState<GithubSyncConfigView | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [tokenInput, setTokenInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    const c = await api.syncConfig();
    setCfg(c);
    setRepoUrl(c.repoUrl);
    setBranch(c.branch);
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (!cfg) return null;

  const toggle = async (next: boolean) => {
    await api.settingsSet("github_sync_enabled", next ? "1" : "0");
    await refresh();
  };

  const saveToken = async () => {
    if (!tokenInput.trim()) return;
    await api.settingsSet("github_token", tokenInput.trim());
    setTokenInput("");
    await refresh();
  };

  const syncNow = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.syncNow();
      setMsg(r.message);
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  return (
    <section className="rounded-xl border border-border bg-surface/40 p-5 space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-text">GitHub sync</h3>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => void toggle(e.target.checked)}
            className="h-3.5 w-3.5 rounded-sm border-border-strong bg-elevate accent-emerald-500"
          />
          Enabled
        </label>
      </div>

      <p className="text-sm text-subtle">
        Pushes your data at startup and right after the end-of-day report.
        Events, scores and notes go to separate directories so they stay easy to
        analyse later. Use a <span className="text-text">private</span>{" "}
        repository — this is your full activity history.
      </p>

      <div className="space-y-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-subtle">
            Repository URL
          </span>
          <input
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            onBlur={() => void api.settingsSet("github_repo_url", repoUrl.trim())}
            placeholder="https://github.com/you/desktop-tracker-data.git"
            className="mt-1 w-full bg-bg/60 border border-border rounded px-2 py-1.5 text-sm text-text placeholder:text-faint focus:outline-none focus:border-border-strong"
          />
        </label>

        <label className="block max-w-[200px]">
          <span className="text-xs uppercase tracking-wider text-subtle">Branch</span>
          <input
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            onBlur={() => void api.settingsSet("github_branch", branch.trim() || "main")}
            className="mt-1 w-full bg-bg/60 border border-border rounded px-2 py-1.5 text-sm text-text focus:outline-none focus:border-border-strong"
          />
        </label>

        <div>
          <span className="text-xs uppercase tracking-wider text-subtle">
            Personal access token
          </span>
          {cfg.hasToken ? (
            <div className="mt-1 flex items-center gap-3 text-sm">
              <span className="text-good">Token stored</span>
              <button
                onClick={async () => {
                  await api.settingsSet("github_token", "");
                  await refresh();
                }}
                className="text-xs text-subtle hover:text-bad underline decoration-dotted"
              >
                remove
              </button>
            </div>
          ) : (
            <div className="mt-1 flex gap-2">
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="github_pat_… (needs Contents: read/write)"
                className="flex-1 bg-bg/60 border border-border rounded px-2 py-1.5 text-sm text-text placeholder:text-faint focus:outline-none focus:border-border-strong"
              />
              <button
                onClick={() => void saveToken()}
                className="px-3 py-1.5 rounded bg-elevate hover:bg-border-strong text-sm text-text"
              >
                Save
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => void syncNow()}
          disabled={busy || !cfg.enabled}
          className="px-3 py-1.5 rounded bg-elevate hover:bg-border-strong disabled:opacity-40 text-sm text-text"
        >
          {busy ? "Syncing…" : "Sync now"}
        </button>
        {(msg ?? cfg.last?.message) && (
          <span
            className={
              "text-sm " +
              ((msg ? msg.startsWith("Pushed") || msg.startsWith("Already") : cfg.last?.ok)
                ? "text-good"
                : "text-warn")
            }
          >
            {msg ?? cfg.last?.message}
          </span>
        )}
      </div>
    </section>
  );
}

// ----------------- Notifications section -----------------

function NotificationSection() {
  const [cfg, setCfg] = useState<NotificationConfig | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [status, setStatus] = useState<{
    unproductiveMs: number;
    thresholdMs: number;
    breaches: boolean;
    breakdown: { category: string; ms: number }[];
  } | null>(null);
  const [smtpPasswordInput, setSmtpPasswordInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    const [c, cs, st] = await Promise.all([
      api.notifConfigGet(),
      api.categoriesList(),
      api.notifStatus(),
    ]);
    setCfg(c);
    setCats(cs);
    setStatus(st);
  };

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!cfg) {
    return (
      <section className="rounded-xl border border-border bg-surface/40 p-5">
        <h3 className="text-sm font-medium text-text">Notifications</h3>
        <p className="text-sm text-subtle mt-2">Loading…</p>
      </section>
    );
  }

  const save = async (patch: Partial<NotificationConfig> & { smtpPassword?: string | null }) => {
    setBusy(true);
    setMsg(null);
    try {
      const next = await api.notifConfigSet(patch);
      setCfg(next);
      setMsg("Saved.");
      if (patch.smtpPassword !== undefined) setSmtpPasswordInput("");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.notifTest();
      if (res.error) setMsg(`Test error: ${res.error}`);
      else
        setMsg(
          `Test sent — OS: ${res.os ? "yes" : "no"}, Email: ${res.email ? "yes" : "no"}`
        );
    } finally {
      setBusy(false);
    }
  };

  const toggleUnproductiveCategory = (name: string) => {
    const cur = new Set(cfg.unproductiveCategories);
    if (cur.has(name)) cur.delete(name);
    else cur.add(name);
    void save({ unproductiveCategories: [...cur] });
  };

  return (
    <section className="rounded-xl border border-border bg-surface/40 p-5 space-y-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-text">Notifications</h3>
        <span className="text-xs text-subtle">
          checked every hour + at end-of-day
        </span>
      </div>

      {/* live status */}
      {status && (
        <div
          className={
            "rounded-md p-3 border " +
            (status.breaches
              ? "border-bad/30 bg-bad/5"
              : "border-border bg-surface/40")
          }
        >
          <div className="flex items-baseline justify-between text-sm">
            <div>
              <span className="text-text font-medium">
                {formatDuration(status.unproductiveMs)}
              </span>{" "}
              <span className="text-subtle">
                non-productive today
              </span>
            </div>
            <div className="text-xs text-subtle">
              threshold {formatDuration(status.thresholdMs)} ·{" "}
              <span
                className={status.breaches ? "text-bad" : "text-good"}
              >
                {status.breaches ? "over" : "ok"}
              </span>
            </div>
          </div>
          {status.breakdown.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
              {status.breakdown.map((b) => (
                <span
                  key={b.category}
                  className="px-2 py-0.5 rounded bg-elevate/60 tabular-nums"
                >
                  {b.category} — {formatDuration(b.ms)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* threshold + unproductive categories */}
      <div className="space-y-3">
        <div className="grid grid-cols-12 gap-2 items-center text-sm">
          <label className="col-span-4 text-muted">
            Threshold (minutes / day)
          </label>
          <input
            type="number"
            min={15}
            value={cfg.unproductiveThresholdMin}
            onChange={(e) =>
              setCfg({ ...cfg, unproductiveThresholdMin: Number(e.target.value) })
            }
            onBlur={() =>
              void save({
                unproductiveThresholdMin: cfg.unproductiveThresholdMin,
              })
            }
            className="col-span-3 bg-bg border border-border rounded-md px-3 py-1.5 tabular-nums"
          />
          <span className="col-span-5 text-xs text-subtle">
            Default 180 (3 hours). Idle/locked time always counts.
          </span>
        </div>

        <div>
          <div className="text-sm text-muted mb-2">
            Count these categories as non-productive:
          </div>
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => {
              const on = cfg.unproductiveCategories.includes(c.name);
              return (
                <button
                  key={c.name}
                  onClick={() => toggleUnproductiveCategory(c.name)}
                  className={
                    "px-2.5 py-1 rounded-md border text-sm transition-colors " +
                    (on
                      ? "border-bad/40 bg-bad/10 text-bad"
                      : "border-border text-muted hover:bg-elevate")
                  }
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full mr-2 align-middle"
                    style={{ backgroundColor: c.color }}
                  />
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* channel toggles */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={cfg.osEnabled}
            onChange={(e) => void save({ osEnabled: e.target.checked })}
          />
          <span>OS notifications (system toast)</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={cfg.emailEnabled}
            onChange={(e) => void save({ emailEnabled: e.target.checked })}
          />
          <span>Email (SMTP)</span>
        </label>
      </div>

      {/* SMTP */}
      {cfg.emailEnabled && (
        <div className="space-y-3 border-t border-border pt-4">
          <div className="text-xs text-subtle">
            Pick your provider to fill in the server settings, then enter your
            address and an <strong className="text-text">app password</strong>{" "}
            (not your normal login password — Gmail and Outlook both reject that
            for SMTP).
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {SMTP_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() =>
                  void save({
                    smtpHost: p.host,
                    smtpPort: p.port,
                    smtpSecure: p.secure,
                  })
                }
                className={
                  "px-2.5 py-1 rounded text-xs border transition-colors " +
                  (cfg.smtpHost === p.host
                    ? "border-border-strong bg-elevate text-text"
                    : "border-border text-muted hover:text-text hover:border-border-strong")
                }
              >
                {p.label}
              </button>
            ))}
            {SMTP_PRESETS.find((p) => p.host === cfg.smtpHost)?.help && (
              <span className="text-xs text-subtle">
                {SMTP_PRESETS.find((p) => p.host === cfg.smtpHost)!.help}
              </span>
            )}
          </div>
          <div className="grid grid-cols-12 gap-2 text-sm">
            <input
              value={cfg.smtpHost}
              onChange={(e) => setCfg({ ...cfg, smtpHost: e.target.value })}
              onBlur={() => void save({ smtpHost: cfg.smtpHost })}
              placeholder="SMTP host (e.g. smtp.gmail.com)"
              className="col-span-6 bg-bg border border-border rounded-md px-3 py-1.5"
            />
            <input
              type="number"
              value={cfg.smtpPort}
              onChange={(e) => setCfg({ ...cfg, smtpPort: Number(e.target.value) })}
              onBlur={() => void save({ smtpPort: cfg.smtpPort })}
              className="col-span-2 bg-bg border border-border rounded-md px-3 py-1.5 tabular-nums"
            />
            <label className="col-span-4 flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={cfg.smtpSecure}
                onChange={(e) => void save({ smtpSecure: e.target.checked })}
              />
              Secure (TLS on connect — port 465)
            </label>
          </div>
          <div className="grid grid-cols-12 gap-2 text-sm">
            <input
              value={cfg.smtpUser}
              onChange={(e) => setCfg({ ...cfg, smtpUser: e.target.value })}
              onBlur={() => void save({ smtpUser: cfg.smtpUser })}
              placeholder="SMTP username"
              className="col-span-6 bg-bg border border-border rounded-md px-3 py-1.5"
            />
            <input
              type="password"
              value={smtpPasswordInput}
              onChange={(e) => setSmtpPasswordInput(e.target.value)}
              placeholder={
                cfg.smtpPassMasked ? "•••••• (saved)" : "SMTP password / app password"
              }
              className="col-span-4 bg-bg border border-border rounded-md px-3 py-1.5 font-mono text-xs"
            />
            <button
              onClick={() =>
                void save({ smtpPassword: smtpPasswordInput || null })
              }
              disabled={!smtpPasswordInput && !cfg.smtpPassMasked}
              className="col-span-2 px-3 py-1.5 rounded border border-border hover:bg-elevate text-sm disabled:opacity-40"
            >
              {smtpPasswordInput ? "Save pwd" : cfg.smtpPassMasked ? "Clear pwd" : "Save pwd"}
            </button>
          </div>
          <div className="grid grid-cols-12 gap-2 text-sm">
            <input
              value={cfg.emailFrom}
              onChange={(e) => setCfg({ ...cfg, emailFrom: e.target.value })}
              onBlur={() => void save({ emailFrom: cfg.emailFrom })}
              placeholder='From: "You" <you@example.com>'
              className="col-span-6 bg-bg border border-border rounded-md px-3 py-1.5"
            />
            <input
              value={cfg.emailTo}
              onChange={(e) => setCfg({ ...cfg, emailTo: e.target.value })}
              onBlur={() => void save({ emailTo: cfg.emailTo })}
              placeholder="To: you@example.com"
              className="col-span-6 bg-bg border border-border rounded-md px-3 py-1.5"
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <button
          onClick={() => void sendTest()}
          disabled={busy || (!cfg.osEnabled && !cfg.emailEnabled)}
          className="px-3 py-1.5 rounded-md border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 text-sm disabled:opacity-40"
        >
          Send test
        </button>
        <button
          onClick={async () => {
            const log = await api.notifCheckNow();
            setMsg(
              log
                ? `Notification fired: ${log.title}`
                : "Below threshold or already alerted today."
            );
          }}
          disabled={busy}
          className="px-3 py-1.5 rounded-md border border-border hover:bg-elevate text-sm disabled:opacity-40"
        >
          Run check now
        </button>
        {msg && <span className="text-sm text-muted ml-2">{msg}</span>}
      </div>
    </section>
  );
}
