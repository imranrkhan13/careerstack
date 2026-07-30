"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Briefcase, Mail, RefreshCw } from "lucide-react";
import Sidebar from "@/components/today/Sidebar";
import MobileNav from "@/components/today/MobileNav";
import PipelineChart from "@/components/applications/PipelineChart";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import ErrorPanel from "@/components/ui/ErrorPanel";
import Skeleton from "@/components/ui/Skeleton";
import { api, ApplicationRecord, CommandCenter, TopAction } from "@/lib/api";

function destination(action: TopAction) {
  return action.kind === "stale_application" ? "/applications" : "/boardy";
}

export default function TodayPage() {
  const router = useRouter();
  const [applications, setApplications] = useState<ApplicationRecord[] | null>(null);
  const [center, setCenter] = useState<CommandCenter | null>(null);
  const [error, setError] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load(showRefreshing = false) {
    if (showRefreshing) setRefreshing(true);
    setError(null);
    try {
      const [apps, commandCenter] = await Promise.all([api.listApplications(), api.commandCenter()]);
      setApplications(apps);
      setCenter(commandCenter);
    } catch (e: any) {
      setError(e);
    } finally {
      if (showRefreshing) setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar active="Today" />
      <MobileNav active="Today" />

      <main className="min-w-0 flex-1 px-6 py-7 pb-24 lg:px-10 lg:pb-8">
        <div className="mx-auto max-w-6xl">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.14em] text-signal">Careerstack</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-text">Your job search, in one place.</h1>
              <p className="mt-1 text-sm text-secondary">Talk to Boardy, keep applications moving, and follow up with the right people.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => load(true)} disabled={refreshing}>
                <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />
                {refreshing ? "Refreshing" : "Refresh"}
              </Button>
              <Button variant="primary" onClick={() => router.push("/boardy")}>
                <Mail size={15} aria-hidden="true" /> Talk to Boardy
              </Button>
            </div>
          </header>

          {error && <div className="mt-5"><ErrorPanel error={error} title="Couldn’t refresh your data" /></div>}

          <div className="mt-7 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            {applications ? <PipelineChart applications={applications} /> : <Skeleton className="h-56 rounded-2xl" />}

            <Card className="flex flex-col justify-between bg-raised/60">
              <div>
                <p className="text-sm font-semibold text-text">Start with Boardy</p>
                <p className="mt-1 text-sm leading-relaxed text-secondary">
                  Ask for company research, people to meet, application feedback, or a follow-up. When Boardy names a person, their LinkedIn link or email lands in People automatically.
                </p>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={() => router.push("/boardy")}>Open Boardy</Button>
                <Button variant="secondary" size="sm" onClick={() => router.push("/network")}>View people</Button>
              </div>
            </Card>
          </div>

          <section className="mt-7">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-text">Needs your attention</h2>
                <p className="mt-0.5 text-sm text-secondary">Specific follow-ups and Boardy replies that need a decision.</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => router.push("/applications")}>
                <Briefcase size={14} aria-hidden="true" /> Applications
              </Button>
            </div>

            {!center && !error && <Skeleton className="h-36 rounded-2xl" />}
            {center?.top_actions.length === 0 && (
              <Card className="py-8 text-center">
                <p className="text-sm font-semibold text-text">Nothing needs a decision right now.</p>
                <p className="mt-1 text-sm text-secondary">Ask Boardy about a company or add a role to start building your pipeline.</p>
              </Card>
            )}
            {center && center.top_actions.length > 0 && (
              <div className="grid gap-2 md:grid-cols-2">
                {center.top_actions.map((action) => (
                  <button
                    key={`${action.kind}-${action.ref_id}-${action.title}`}
                    onClick={() => router.push(destination(action))}
                    className="group rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:border-signal/40 hover:bg-signalLight/20"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-signalLight text-xs font-bold text-signal">
                        {action.kind === "boardy_followup" ? "!" : "B"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold leading-snug text-text group-hover:text-signal">{action.title}</span>
                        <span className="mt-1 block text-xs leading-relaxed text-secondary">{action.detail}</span>
                        <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-signal">{action.action}<ArrowUpRight size={13} aria-hidden="true" /></span>
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
