import { useEffect, useState } from "react";
import type { Category, NotificationConfig } from "@desktop-tracker/shared";
import type { AiStatus, ApiKeyStatus } from "../../preload";
import { api } from "../lib/api";
import { formatDuration } from "../lib/format";

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
        <p className="text-sm text-slate-500 mt-1">
          Tracker behaviour, AI tagging, and privacy.
        </p>
      </header>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-slate-200">AI tagging (Groq)</h3>
          <span className="text-xs text-slate-500">llama-3.1-8b-instant by default</span>
        </div>
        <p className="text-sm text-slate-500">
          With AI tagging on, every active event with a meaningful title is
          classified into your category taxonomy in batches every 2 minutes.
          Your key is stored only in the local SQLite database in your AppData
          folder.
        </p>

        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-9 flex items-center gap-2 px-3 py-2 rounded border border-slate-800 bg-slate-950 font-mono text-xs">
            {keyStatus?.hasValue ? (
              <>
                <span className="text-emerald-400">●</span>
                <span className="text-slate-400">Saved key</span>
                <span className="text-slate-200 ml-2">{keyStatus.preview}</span>
              </>
            ) : (
              <>
                <span className="text-rose-400">●</span>
                <span className="text-slate-500">No key configured</span>
              </>
            )}
          </div>
          {keyStatus?.hasValue && (
            <button
              onClick={() => void clearKey()}
              disabled={busy}
              className="col-span-3 px-3 py-2 rounded border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 text-sm disabled:opacity-40"
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
            className="col-span-9 bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-sm font-mono"
          />
          <button
            onClick={() => void saveKey()}
            disabled={busy || !keyInput.trim()}
            className="col-span-3 px-3 py-2 rounded bg-sky-500/20 border border-sky-500/40 text-sky-200 hover:bg-sky-500/30 text-sm disabled:opacity-40"
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
            className="col-span-4 bg-slate-950 border border-slate-800 rounded-md px-2 py-1.5 font-mono text-xs"
          />
          <button
            onClick={() => void runNow()}
            disabled={busy || !keyStatus?.hasValue || !enabled}
            className="col-span-2 px-3 py-1.5 rounded border border-slate-800 hover:bg-slate-800 text-sm disabled:opacity-40"
          >
            Run now
          </button>
        </div>

        {aiStatus && (
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 pt-2 border-t border-slate-800">
            <div>
              Status:{" "}
              <span className="text-slate-200">
                {aiStatus.running
                  ? "running"
                  : aiStatus.enabled && aiStatus.hasKey
                  ? "idle"
                  : "off"}
              </span>
            </div>
            <div>
              Last tagged:{" "}
              <span className="text-slate-200">{aiStatus.lastTagged}</span>
              {aiStatus.lastRunAt && (
                <span className="text-slate-500 ml-2">
                  at{" "}
                  {new Date(aiStatus.lastRunAt).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
            {aiStatus.lastError && (
              <div className="col-span-2 text-rose-300">
                Last error: {aiStatus.lastError}
              </div>
            )}
          </div>
        )}

        {msg && <div className="text-sm text-emerald-300">{msg}</div>}
      </section>

      <NotificationSection />

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-sm font-medium text-slate-200 mb-3">Tracking</h3>
        <ul className="text-sm text-slate-400 space-y-2">
          <li>Idle threshold: <span className="text-slate-200">60 seconds</span></li>
          <li>Heartbeat interval: <span className="text-slate-200">1 second</span></li>
          <li>Pause tracking: <span className="text-slate-500">(coming in v0.5)</span></li>
        </ul>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-sm font-medium text-slate-200 mb-3">Reports</h3>
        <ul className="text-sm text-slate-400 space-y-2">
          <li>Daily report: <span className="text-slate-200">23:55 local</span></li>
          <li>Weekly report: <span className="text-slate-200">Sunday 21:00 local</span></li>
        </ul>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-sm font-medium text-slate-200 mb-3">Privacy</h3>
        <ul className="text-sm text-slate-400 space-y-2">
          <li>All activity data + API key + SMTP password live in <code className="text-slate-300">%APPDATA%</code>.</li>
          <li>Incognito / private browsing windows are skipped.</li>
          <li>AI tagging sends window titles + URLs + app names to Groq — review their privacy policy before enabling.</li>
        </ul>
      </section>
    </div>
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
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-sm font-medium text-slate-200">Notifications</h3>
        <p className="text-sm text-slate-500 mt-2">Loading…</p>
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
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-slate-200">Notifications</h3>
        <span className="text-xs text-slate-500">
          checked every hour + at end-of-day
        </span>
      </div>

      {/* live status */}
      {status && (
        <div
          className={
            "rounded-md p-3 border " +
            (status.breaches
              ? "border-rose-500/30 bg-rose-500/5"
              : "border-slate-800 bg-slate-900/40")
          }
        >
          <div className="flex items-baseline justify-between text-sm">
            <div>
              <span className="text-slate-200 font-medium">
                {formatDuration(status.unproductiveMs)}
              </span>{" "}
              <span className="text-slate-500">
                non-productive today
              </span>
            </div>
            <div className="text-xs text-slate-500">
              threshold {formatDuration(status.thresholdMs)} ·{" "}
              <span
                className={status.breaches ? "text-rose-300" : "text-emerald-300"}
              >
                {status.breaches ? "over" : "ok"}
              </span>
            </div>
          </div>
          {status.breakdown.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
              {status.breakdown.map((b) => (
                <span
                  key={b.category}
                  className="px-2 py-0.5 rounded bg-slate-800/60 tabular-nums"
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
          <label className="col-span-4 text-slate-400">
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
            className="col-span-3 bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 tabular-nums"
          />
          <span className="col-span-5 text-xs text-slate-500">
            Default 180 (3 hours). Idle/locked time always counts.
          </span>
        </div>

        <div>
          <div className="text-sm text-slate-400 mb-2">
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
                      ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                      : "border-slate-800 text-slate-400 hover:bg-slate-800")
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
        <div className="space-y-3 border-t border-slate-800 pt-4">
          <div className="text-xs text-slate-500">
            Most providers work — for Gmail use an "app password", port 587 STARTTLS or 465 SSL.
          </div>
          <div className="grid grid-cols-12 gap-2 text-sm">
            <input
              value={cfg.smtpHost}
              onChange={(e) => setCfg({ ...cfg, smtpHost: e.target.value })}
              onBlur={() => void save({ smtpHost: cfg.smtpHost })}
              placeholder="SMTP host (e.g. smtp.gmail.com)"
              className="col-span-6 bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5"
            />
            <input
              type="number"
              value={cfg.smtpPort}
              onChange={(e) => setCfg({ ...cfg, smtpPort: Number(e.target.value) })}
              onBlur={() => void save({ smtpPort: cfg.smtpPort })}
              className="col-span-2 bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 tabular-nums"
            />
            <label className="col-span-4 flex items-center gap-2 text-xs text-slate-400">
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
              className="col-span-6 bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5"
            />
            <input
              type="password"
              value={smtpPasswordInput}
              onChange={(e) => setSmtpPasswordInput(e.target.value)}
              placeholder={
                cfg.smtpPassMasked ? "•••••• (saved)" : "SMTP password / app password"
              }
              className="col-span-4 bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 font-mono text-xs"
            />
            <button
              onClick={() =>
                void save({ smtpPassword: smtpPasswordInput || null })
              }
              disabled={!smtpPasswordInput && !cfg.smtpPassMasked}
              className="col-span-2 px-3 py-1.5 rounded border border-slate-800 hover:bg-slate-800 text-sm disabled:opacity-40"
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
              className="col-span-6 bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5"
            />
            <input
              value={cfg.emailTo}
              onChange={(e) => setCfg({ ...cfg, emailTo: e.target.value })}
              onBlur={() => void save({ emailTo: cfg.emailTo })}
              placeholder="To: you@example.com"
              className="col-span-6 bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5"
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
        <button
          onClick={() => void sendTest()}
          disabled={busy || (!cfg.osEnabled && !cfg.emailEnabled)}
          className="px-3 py-1.5 rounded-md border border-sky-500/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20 text-sm disabled:opacity-40"
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
          className="px-3 py-1.5 rounded-md border border-slate-800 hover:bg-slate-800 text-sm disabled:opacity-40"
        >
          Run check now
        </button>
        {msg && <span className="text-sm text-slate-400 ml-2">{msg}</span>}
      </div>
    </section>
  );
}
