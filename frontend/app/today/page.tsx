"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/today/Sidebar";
import MobileNav from "@/components/today/MobileNav";
import FeedTimeline from "@/components/today/FeedTimeline";
import ContextPanel from "@/components/today/ContextPanel";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { api, TodayItem, CommandCenter, AgentStatus } from "@/lib/api";

const ACTION_ROUTES: Record<string, string> = {
  boardy_followup: "/boardy",
  boardy_recommendation: "/boardy",
  stale_application: "/applications",
  // skill_gap has no destination page — it's explained inline (see expandedAction below),
  // never routed. Previously it silently fell through to "/today" (itself), which is why
  // the button looked broken instead of doing nothing.
};

export default function TodayPage() {
  const router = useRouter();
  const [items, setItems] = useState<TodayItem[] | null>(null);
  const [center, setCenter] = useState<CommandCenter | null>(null);
  const [agents, setAgents] = useState<AgentStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filter, setFilter] = useState<"all" | "boardy" | "resume" | "gap">("all");
  const [expandedAction, setExpandedAction] = useState<number | null>(null);

  useEffect(() => {
    api.today().then(setItems).catch((e) => setError(e.message));
    api.commandCenter().then(setCenter).catch((e) => setError(e.message));
    api.agentStatus().then(setAgents).catch(() => setAgents(null));
  }, []);

  function handleAction(item: TodayItem) {
    if (item.kind === "resume_update") router.push("/resume");
    if (item.kind === "network") router.push("/network");
    if (item.kind === "application") router.push("/applications");
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const resumeAgent = agents?.find((a) => a.name === "Resume Agent");

  const filteredItems = (items ?? []).filter((item) => {
    if (filter === "all") return true;
    if (filter === "boardy") return item.kind === "boardy_reply";
    if (filter === "resume") return item.kind === "resume_update";
    if (filter === "gap") return item.kind === "gap";
    return true;
  });

  const TABS: { key: typeof filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "boardy", label: "Boardy" },
    { key: "resume", label: "Resume" },
    { key: "gap", label: "Gaps" },
  ];

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar active="Today" />
      <MobileNav active="Today" />

      <main className="flex-1 flex flex-col min-w-0 pb-16 lg:pb-0">
        <div className="px-6 py-6 border-b border-border">
          <h1 className="text-xl font-bold text-text tracking-tight">{greeting}, Imran</h1>
          <p className="text-sm text-secondary mt-1">What should you focus on today?</p>
          <p className="text-xs text-muted mt-1">
            Paste a job → Boardy tailors your resume → track it in Applications. That's the whole loop.
          </p>

          {center && (
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <StatusChip
                ok={center.gmail.connected}
                label={center.gmail.connected ? `Gmail Connected` : "Gmail Not Connected"}
                href="/settings"
              />
              <StatusChip
                ok={center.boardy.threads_awaiting_reply === 0}
                label={
                  center.boardy.threads_awaiting_reply === 0
                    ? "Boardy Connected"
                    : `Boardy · ${center.boardy.threads_awaiting_reply} awaiting reply`
                }
                href="/boardy"
              />
              <StatusChip
                ok={center.applications.stale_count === 0}
                label={`Applications · ${center.applications.total}`}
                href="/applications"
              />
              <StatusChip
                ok={!!resumeAgent && resumeAgent.status === "active"}
                label={resumeAgent ? `Resume · ${resumeAgent.last_action}` : "Resume freshness unknown"}
                href="/resume"
              />
            </div>
          )}
        </div>

        {error && (
          <div className="px-6 py-4 text-sm text-muted">
            Couldn't reach the API ({error}). Is the backend running on :8000?
          </div>
        )}

        {center && (
          <div className="px-6 py-4 border-b border-border">
            {center.top_actions.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing urgent right now. As Boardy replies, applications change, or gaps
                appear, they'll show up here — ranked by what actually needs attention.
              </p>
            ) : (
              <div className="space-y-2">
                {center.top_actions.map((a, i) => (
                  <Card key={i} className="py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text truncate">{a.title}</p>
                        {a.detail && (
                          <p className={`text-xs text-secondary mt-0.5 ${expandedAction === i ? "" : "truncate"}`}>
                            {a.detail}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          a.kind in ACTION_ROUTES
                            ? router.push(ACTION_ROUTES[a.kind])
                            : setExpandedAction((prev) => (prev === i ? null : i))
                        }
                      >
                        {a.action}
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="px-6 pt-4 pb-2 flex items-center justify-between">
          <p className="text-[11px] font-mono font-medium text-muted uppercase tracking-wide">Inbox</p>
          <div className="flex items-center gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors duration-150 ${
                  filter === tab.key ? "bg-raised text-text" : "text-muted hover:text-secondary"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {!items && !error && (
          <div className="px-4 py-3 space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-border p-4 flex gap-3">
                <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        )}

        {items && (
          <FeedTimeline
            items={filteredItems}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
            onAction={handleAction}
          />
        )}
      </main>

      <ContextPanel item={filteredItems[selectedIndex] ?? null} onAction={handleAction} />
    </div>
  );
}

function StatusChip({ ok, label, href }: { ok: boolean; label: string; href: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(href)}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/30 ${
        ok ? "border-border text-secondary hover:border-signal/40" : "border-gap/30 text-gap hover:bg-gap/10"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-signal" : "bg-gap"}`} />
      {label}
    </button>
  );
}
