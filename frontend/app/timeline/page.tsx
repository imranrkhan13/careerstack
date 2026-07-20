"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/today/Sidebar";
import MobileNav from "@/components/today/MobileNav";
import ActivityHeatmap from "@/components/timeline/ActivityHeatmap";
import Narrative from "@/components/timeline/Narrative";
import Button from "@/components/ui/Button";
import { api, HeatmapDay, Milestone } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function TimelinePage() {
  const router = useRouter();
  const [heatmap, setHeatmap] = useState<HeatmapDay[] | null>(null);
  const [milestones, setMilestones] = useState<Milestone[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightedDate, setHighlightedDate] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.timelineHeatmap(180), api.timelineMilestones(50)])
      .then(([h, m]) => {
        setHeatmap(h);
        setMilestones(m);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar active="Timeline" />
      <MobileNav active="Timeline" />
      <main className="flex-1 px-8 py-6 pb-20 lg:pb-6 max-w-3xl">
        <h1 className="text-lg font-bold text-text tracking-tight">Career Timeline</h1>
        <p className="text-xs text-muted mt-0.5 mb-6">
          Every real event in your career, over time — not a job-application log, a career log.
        </p>

        {error && <p className="text-sm text-muted">Couldn't reach the API ({error}).</p>}

        {heatmap && <ActivityHeatmap days={heatmap} highlightedDate={highlightedDate} />}

        <div className="mt-8">
          {milestones && milestones.length > 0 && (
            <Narrative
              milestones={milestones}
              highlightedDate={highlightedDate}
              onHighlight={(date) => setHighlightedDate((prev) => (prev === date ? null : date))}
            />
          )}
          {milestones && milestones.length === 0 && (
            <div className="text-center py-10">
              <p className="text-3xl mb-3">🗓️</p>
              <p className="text-sm font-medium text-text mb-1.5">Your story starts here.</p>
              <p className="text-sm text-secondary mb-5">
                Every real career event — from your first resume to your first offer — shows up here over time.
              </p>
              <Button variant="secondary" size="sm" onClick={() => router.push("/onboarding")}>
                Import your resume to get started
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
