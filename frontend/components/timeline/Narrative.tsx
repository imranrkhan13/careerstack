"use client";

import { FileText, FolderGit2, Sparkles, Layers, Building2, Briefcase, ArrowRightCircle, Circle } from "lucide-react";
import { Milestone } from "@/lib/api";
import Card from "@/components/ui/Card";

/**
 * One interleaved feed: month heading -> a deterministic narrative summary
 * (NOT an AI summary — fixed count-based sentences, same input always
 * produces the same output) -> the real event cards for that month. This
 * replaces the old "narrative section" + "flat event list" split.
 */
function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function buildLines(monthMilestones: Milestone[]): string[] {
  const lines: string[] = [];
  const byType = (t: string) => monthMilestones.filter((m) => m.type === t).length;
  const stageMoves = (stage: string) =>
    monthMilestones.filter((m) => m.type === "application_stage" && m.label.includes(`moved to ${stage}`)).length;

  const newApps = byType("application");
  if (newApps > 0) lines.push(`Started ${newApps} new application${newApps !== 1 ? "s" : ""}.`);

  const interviews = stageMoves("interview");
  if (interviews > 0) lines.push(`Reached interview stage for ${interviews} application${interviews !== 1 ? "s" : ""}.`);

  const offers = stageMoves("offer");
  if (offers > 0) lines.push(`Received ${offers} offer${offers !== 1 ? "s" : ""}.`);

  const skills = byType("skill");
  if (skills > 0) lines.push(`Identified ${skills} new skill${skills !== 1 ? "s" : ""}.`);

  const repos = byType("repository");
  if (repos > 0) lines.push(`Imported ${repos} GitHub repositor${repos !== 1 ? "ies" : "y"}.`);

  const projects = byType("project");
  if (projects > 0) lines.push(`Mapped ${projects} project${projects !== 1 ? "s" : ""}.`);

  return lines;
}

const TYPE_META: Record<string, { icon: typeof FileText; source: string }> = {
  resume: { icon: FileText, source: "Resume" },
  repository: { icon: FolderGit2, source: "GitHub" },
  skill: { icon: Sparkles, source: "Career Graph" },
  project: { icon: Layers, source: "Portfolio" },
  company: { icon: Building2, source: "Career Graph" },
  application: { icon: Briefcase, source: "Applications" },
  application_stage: { icon: ArrowRightCircle, source: "Applications" },
};

export default function Narrative({
  milestones,
  highlightedDate,
  onHighlight,
}: {
  milestones: Milestone[];
  highlightedDate?: string | null;
  onHighlight?: (date: string) => void;
}) {
  const groups = new Map<string, Milestone[]>();
  for (const m of milestones) {
    const key = monthKey(m.at);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }

  const sortedKeys = Array.from(groups.keys()).sort().reverse();

  if (sortedKeys.length === 0) return null;

  return (
    <div className="space-y-6">
      {sortedKeys.map((key) => {
        const monthMilestones = groups.get(key)!;
        const lines = buildLines(monthMilestones);
        return (
          <div key={key}>
            <p className="text-sm font-semibold text-text mb-1.5">{monthLabel(key)}</p>
            {lines.length > 0 && (
              <ul className="space-y-0.5 mb-3">
                {lines.map((line, i) => (
                  <li key={i} className="text-sm text-secondary">
                    {line}
                  </li>
                ))}
              </ul>
            )}
            <div className="space-y-2">
              {monthMilestones.map((m, i) => {
                const meta = TYPE_META[m.type] ?? { icon: Circle, source: "Careerstack" };
                const Icon = meta.icon;
                const dateKey = m.at.slice(0, 10);
                return (
                  <Card
                    key={i}
                    interactive
                    selected={highlightedDate === dateKey}
                    onClick={() => onHighlight?.(dateKey)}
                    className="flex items-start gap-3 py-2.5"
                  >
                    <div className="w-7 h-7 rounded-full bg-signal/10 text-signal flex items-center justify-center shrink-0">
                      <Icon size={13} strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text">{m.label}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted">{new Date(m.at).toLocaleDateString()}</span>
                        <span className="text-xs text-muted">·</span>
                        <span className="text-xs text-muted">{meta.source}</span>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
