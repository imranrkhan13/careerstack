"use client";

import { ApplicationRecord } from "@/lib/api";

const STAGES = [
  ["wishlist", "Saved"],
  ["applied", "Applied"],
  ["recruiter", "Recruiter"],
  ["interview", "Interview"],
  ["offer", "Offer"],
  ["rejected", "Rejected"],
] as const;

export default function PipelineChart({ applications, compact = false }: { applications: ApplicationRecord[]; compact?: boolean }) {
  const counts = Object.fromEntries(STAGES.map(([stage]) => [stage, applications.filter((app) => app.stage === stage).length]));
  const highest = Math.max(1, ...Object.values(counts));

  return (
    <div className={`rounded-2xl border border-border bg-surface ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text">Application pipeline</p>
          <p className="mt-0.5 text-xs text-secondary">Every card is counted from your live board.</p>
        </div>
        <p className="text-2xl font-bold tracking-tight text-text">{applications.length}</p>
      </div>
      <div className="mt-5 grid h-28 grid-cols-6 items-end gap-2 border-b border-border px-1">
        {STAGES.map(([stage]) => {
          const count = counts[stage];
          return (
            <div key={stage} className="flex h-full min-w-0 flex-col justify-end">
              <span className="mb-1 text-center text-xs font-semibold text-text">{count}</span>
              <div
                className={`min-h-[5px] rounded-t-md ${stage === "rejected" ? "bg-gap/60" : stage === "offer" ? "bg-success" : "bg-signal"}`}
                style={{ height: `${Math.max(5, (count / highest) * 82)}px` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-6 gap-2 px-1">
        {STAGES.map(([stage, label]) => <p key={stage} className="truncate text-center text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>)}
      </div>
    </div>
  );
}
