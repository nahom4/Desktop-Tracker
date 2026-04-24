import { useState } from "react";
import { Sidebar, type Page } from "./components/Sidebar";
import { Today } from "./pages/Today";
import { Timeline } from "./pages/Timeline";
import { Weekly } from "./pages/Weekly";
import { Reports } from "./pages/Reports";
import { Categories } from "./pages/Categories";
import { Settings } from "./pages/Settings";

export function App() {
  const [page, setPage] = useState<Page>("today");

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100">
      <Sidebar current={page} onNavigate={setPage} />
      <main className="flex-1 overflow-y-auto">
        {page === "today" && <Today />}
        {page === "timeline" && <Timeline />}
        {page === "weekly" && <Weekly />}
        {page === "reports" && <Reports />}
        {page === "categories" && <Categories />}
        {page === "settings" && <Settings />}
      </main>
    </div>
  );
}
