import { useState } from "react";
import { exportCurrentView } from "../lib/export";

interface ExportMenuProps {
  /** Slug used as the suggested filename (no extension). */
  baseName: string;
  /** Disable the buttons while a parent action is in flight. */
  disabled?: boolean;
}

export function ExportMenu({ baseName, disabled }: ExportMenuProps) {
  const [busy, setBusy] = useState(false);

  const run = async (format: "pdf" | "png") => {
    if (busy) return;
    setBusy(true);
    try {
      await exportCurrentView(format, baseName);
    } finally {
      setBusy(false);
    }
  };

  const buttonClass =
    "px-3 py-1.5 rounded-md border border-slate-800 text-sm hover:bg-slate-800 transition-colors disabled:opacity-40";

  return (
    <div className="flex items-center gap-2" data-export-chrome>
      <button
        className={buttonClass}
        disabled={disabled || busy}
        onClick={() => void run("pdf")}
      >
        Export PDF
      </button>
      <button
        className={buttonClass}
        disabled={disabled || busy}
        onClick={() => void run("png")}
      >
        Export PNG
      </button>
    </div>
  );
}
