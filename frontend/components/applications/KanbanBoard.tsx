"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api, ApplicationRecord } from "@/lib/api";
import NewFromJDFlow from "./NewFromJDFlow";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import LinkedText from "@/components/ui/LinkedText";
import ErrorPanel from "@/components/ui/ErrorPanel";

const STAGE_LABEL: Record<string, string> = {
  wishlist: "Wishlist",
  applied: "Applied",
  recruiter: "Recruiter",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

export default function KanbanBoard() {
  const [stages, setStages] = useState<string[]>([]);
  const [apps, setApps] = useState<ApplicationRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<any>(null);
  const [selected, setSelected] = useState<ApplicationRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showJDFlow, setShowJDFlow] = useState(false);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  async function load() {
    try {
      const [s, a] = await Promise.all([api.applicationStages(), api.listApplications()]);
      setStages(s);
      setApps(a);
    } catch (e: any) {
      setError(e);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function moveStage(id: string, stage: string) {
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, stage } : a)));
    try {
      const updated = await api.updateApplicationStage(id, stage);
      setApps((prev) => prev.map((a) => (a.id === id ? updated : a)));
      if (selected?.id === id) setSelected(updated);
    } catch (e: any) {
      setError(e);
      load(); // revert optimistic update on failure
    }
  }

  const totalApplications = apps.length;
  const reachedInterview = apps.filter((a) => a.timeline.some((t) => t.stage === "interview")).length;
  const reachedOffer = apps.filter((a) => a.timeline.some((t) => t.stage === "offer")).length;
  const distinctCompanies = new Set(apps.map((a) => a.company)).size;

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="px-6 py-5 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-text tracking-tight">Applications</h1>
          <p className="text-xs text-muted mt-0.5">Drag a card between stages — every move is recorded.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => setShowJDFlow(true)}>
            + New from JD
          </Button>
          <Button variant="secondary" onClick={() => setShowForm(true)}>
            + Manual
          </Button>
        </div>
      </div>

      {apps.length > 0 && (
        <div className="px-6 py-5 border-b border-border grid grid-cols-4 gap-6">
          <Stat label="Applications" value={totalApplications} />
          <Stat label="Interviews" value={reachedInterview} />
          <Stat label="Offers" value={reachedOffer} />
          <Stat label="Companies" value={distinctCompanies} />
        </div>
      )}

      {error && <div className="px-6 py-2"><ErrorPanel error={error} /></div>}

      {apps.length === 0 && loaded && !showJDFlow && !showForm && (
        <div className="px-6 py-4">
          <Card className="text-center py-10">
            <p className="text-3xl mb-3">📄</p>
            <p className="text-sm font-medium text-text mb-1.5">You're ready.</p>
            <p className="text-sm text-secondary mb-5">
              Start by pasting a job description — Careerstack will create your first application
              and match it against what it knows about you.
            </p>
            <Button variant="primary" size="sm" onClick={() => setShowJDFlow(true)}>
              Paste a job description
            </Button>
          </Card>
        </div>
      )}

      {!loaded && (
        <div className="flex-1 flex gap-3 px-6 py-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-64 shrink-0 rounded-2xl border border-border bg-surface p-3 space-y-2">
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ))}
        </div>
      )}

      {showJDFlow && (
        <NewFromJDFlow
          onClose={() => setShowJDFlow(false)}
          onCreated={(a) => {
            setApps((prev) => [...prev, a]);
          }}
        />
      )}

      {showForm && (
        <NewApplicationForm
          onClose={() => setShowForm(false)}
          onCreated={(a) => {
            setApps((prev) => [...prev, a]);
            setShowForm(false);
          }}
        />
      )}

      {loaded && (
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-3 px-6 py-4 h-full min-w-max">
            {stages.map((stage) => (
            <div
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(stage);
              }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                setDragOverStage(null);
                if (id) moveStage(id, stage);
              }}
              className={`w-64 shrink-0 rounded-lg border bg-surface p-2 transition-colors ${
                dragOverStage === stage ? "border-signal/50" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-xs font-mono text-muted uppercase tracking-wide">
                  {STAGE_LABEL[stage] ?? stage}
                </span>
                <span className="text-xs font-mono text-muted">
                  {apps.filter((a) => a.stage === stage).length}
                </span>
              </div>
              <div className="space-y-2 mt-1">
                {apps
                  .filter((a) => a.stage === stage)
                  .map((a) => {
                    const daysSinceActivity = Math.floor(
                      (Date.now() - new Date(a.timeline[a.timeline.length - 1]?.at ?? a.updated_at).getTime()) /
                        86400000
                    );
                    const needsFollowUp =
                      ["applied", "recruiter"].includes(a.stage) && daysSinceActivity >= 7;
                    return (
                      <Card
                        key={a.id}
                        interactive
                        draggable
                        onDragStart={(e) => (e as any).dataTransfer.setData("text/plain", a.id)}
                        onClick={() => setSelected(a)}
                        className="p-3 cursor-grab active:cursor-grabbing"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-text">{a.role}</p>
                          {a.match_score != null && (
                            <span className="text-[11px] font-mono text-signal shrink-0">
                              {Math.round(a.match_score * 100)}%
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-secondary mt-0.5">{a.company}</p>
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {a.salary && <span className="text-[11px] font-mono text-muted">{a.salary}</span>}
                          {a.stale && <Badge tone="gap">match changed</Badge>}
                          {needsFollowUp && <Badge tone="signal">follow up due</Badge>}
                        </div>
                      </Card>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {selected && (
        <ApplicationDetail
          app={selected}
          stages={stages}
          onChangeStage={(stage) => moveStage(selected.id, stage)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function NewApplicationForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (a: ApplicationRecord) => void;
}) {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [salary, setSalary] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<any>(null);

  async function submit() {
    if (!company.trim() || !role.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const app = await api.createApplication(company.trim(), role.trim(), salary.trim() || undefined);
      onCreated(app);
    } catch (e: any) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center px-6" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-text mb-3">New application</h2>
        <Input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Role — e.g. Backend Engineer"
          className="mb-2"
        />
        <Input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Company"
          className="mb-2"
        />
        <Input
          value={salary}
          onChange={(e) => setSalary(e.target.value)}
          placeholder="Salary (optional)"
          className="mb-3"
        />
        {error && <div className="mb-2"><ErrorPanel error={error} /></div>}
        <div className="flex gap-2">
          <Button variant="primary" onClick={submit} disabled={saving || !company.trim() || !role.trim()}>
            {saving ? "Adding…" : "Add"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function ApplicationDetail({
  app,
  stages,
  onChangeStage,
  onClose,
}: {
  app: ApplicationRecord;
  stages: string[];
  onChangeStage: (stage: string) => void;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(app);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    setCurrent(app);
  }, [app]);

  async function dismissStale() {
    setDismissing(true);
    try {
      const updated = await api.dismissStale(current.id);
      setCurrent(updated);
    } finally {
      setDismissing(false);
    }
  }

  return (
    <motion.div
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="fixed inset-y-0 right-0 z-30 w-96 bg-surface border-l border-border shadow-2xl overflow-y-auto"
    >
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text">{current.role}</h2>
          <p className="text-xs text-secondary">{current.company}</p>
        </div>
        <button onClick={onClose} className="text-muted hover:text-secondary text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/30 rounded">
          ✕
        </button>
      </div>
      <div className="px-5 py-4">
        {/* Properties — Linear-style: status is a first-class, always-visible control, not just drag-and-drop */}
        <div className="mb-4 pb-4 border-b border-border space-y-2.5">
          <PropertyRow label="Status">
            <select
              value={current.stage}
              onChange={(e) => onChangeStage(e.target.value)}
              className="text-xs font-medium text-text bg-raised border border-border rounded-md px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-signal/30"
            >
              {stages.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s] ?? s}
                </option>
              ))}
            </select>
          </PropertyRow>
          {current.salary && <PropertyRow label="Salary">{current.salary}</PropertyRow>}
          {current.match_score != null && (
            <PropertyRow label="Match">
              <span className="text-signal font-mono">{Math.round(current.match_score * 100)}%</span>
            </PropertyRow>
          )}
        </div>

        {current.match_score != null && current.matched_skills && current.matched_skills.length > 0 && (
          <p className="text-xs text-secondary mb-4">Matched on: {current.matched_skills.join(", ")}</p>
        )}

        {current.stale && (
          <div className="mb-4 flex items-center justify-between rounded-md bg-gap/10 border border-gap/20 px-2.5 py-1.5">
            <span className="text-xs text-gap">Your skills changed since this was scored.</span>
            <button onClick={dismissStale} disabled={dismissing} className="text-xs text-gap underline shrink-0 ml-2">
              {dismissing ? "…" : "Got it"}
            </button>
          </div>
        )}

        {current.boardy_draft && (
          <div className="mb-4">
            <p className="text-[11px] font-mono font-medium text-muted uppercase tracking-wide mb-1.5">Draft outreach</p>
            <p className="text-xs text-secondary whitespace-pre-wrap bg-raised border border-border rounded-md p-2.5">
              <LinkedText text={current.boardy_draft} />
            </p>
          </div>
        )}

        <p className="text-[11px] font-mono font-medium text-muted uppercase tracking-wide mb-2">Timeline</p>
        <ul className="space-y-3">
          {[...current.timeline].reverse().map((t, i) => (
            <li key={i} className="text-xs">
              <span className="text-text">{STAGE_LABEL[t.stage] ?? t.stage}</span>
              <span className="text-muted"> · {new Date(t.at).toLocaleString()}</span>
              {t.note && <p className="text-secondary mt-0.5">{t.note}</p>}
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-xs text-text">{children}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  // Deliberately no invented trend arrows ("↑ 18% this month") — that would
  // need a historical baseline we don't compute. Real counts only.
  return (
    <div>
      <p className="text-3xl font-bold text-text tracking-tight">{value}</p>
      <p className="text-xs text-secondary mt-0.5">{label}</p>
    </div>
  );
}
