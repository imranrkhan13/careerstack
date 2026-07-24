"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Check,
  X,
  Loader2,
  CircleDot,
  GitPullRequestArrow,
  RotateCcw,
  Trash2,
  FlaskConical,
} from "lucide-react";
import { buildApi, ChangeRequestDetail, BuildBrief, BuildRun } from "@/lib/api";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import ErrorPanel from "@/components/ui/ErrorPanel";
import BuildShell, { SectionTitle, StatusPill } from "@/components/build/BuildShell";
import DiffView from "@/components/build/DiffView";

const STAGES = ["Request", "Brief", "Scope", "Execution", "Review"];

function stageIndex(status: string): number {
  switch (status) {
    case "draft":
      return 1;
    case "brief_ready":
      return 1;
    case "scope_approved":
      return 2;
    case "executing":
    case "paused_needs_approval":
      return 3;
    case "awaiting_review":
    case "pr_created":
    case "revision_requested":
    case "discarded":
      return 4;
    default:
      return 0;
  }
}

export default function ChangeRequestPage() {
  const params = useParams();
  const router = useRouter();
  const crId = params.id as string;
  const [cr, setCr] = useState<ChangeRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const briefTriggered = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await buildApi.getChangeRequest(crId);
      setCr(data);
      return data;
    } catch (e) {
      setError(e);
      return null;
    } finally {
      setLoading(false);
    }
  }, [crId]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-generate the brief the first time we land on a freshly-created (draft) request.
  useEffect(() => {
    if (cr?.status === "draft" && !briefTriggered.current) {
      briefTriggered.current = true;
      setBusy(true);
      buildApi
        .generateBrief(crId)
        .then(setCr)
        .catch(setError)
        .finally(() => setBusy(false));
    }
  }, [cr?.status, crId]);

  // Poll while the agent is executing.
  useEffect(() => {
    if (cr?.status !== "executing") return;
    const t = setInterval(async () => {
      try {
        const { run, change_request_status } = await buildApi.getRun(crId);
        setCr((prev) => (prev ? { ...prev, run, status: change_request_status } : prev));
        if (["completed", "failed", "paused"].includes(run.status)) {
          clearInterval(t);
          load();
        }
      } catch {
        /* keep polling */
      }
    }, 1500);
    return () => clearInterval(t);
  }, [cr?.status, crId, load]);

  async function action(fn: () => Promise<ChangeRequestDetail>) {
    setBusy(true);
    setError(null);
    try {
      setCr(await fn());
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <BuildShell>
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </BuildShell>
    );
  }
  if (!cr) {
    return (
      <BuildShell>
        <ErrorPanel error={(error as Error) ?? "Change request not found"} />
      </BuildShell>
    );
  }

  const currentStage = stageIndex(cr.status);

  return (
    <BuildShell>
      <Link href="/build" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text mb-4">
        <ArrowLeft size={14} /> Back to workspace
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-text tracking-tight">{cr.request_text}</h1>
          <div className="flex items-center gap-2 mt-2">
            <StatusPill status={pillFor(cr.status)}>{cr.status.replace(/_/g, " ")}</StatusPill>
            <span className="text-[11px] font-mono text-muted">{cr.risk_level} risk</span>
            {cr.branch_name && <span className="text-[11px] font-mono text-signal">{cr.branch_name}</span>}
          </div>
        </div>
      </div>

      <Stepper current={currentStage} />

      {error != null && (
        <div className="my-4">
          <ErrorPanel error={error as Error} title="Action failed" />
        </div>
      )}

      <div className="mt-5 space-y-5">
        {(cr.constraints_text || cr.acceptance_criteria_text) && (
          <Card>
            {cr.constraints_text && (
              <div className="mb-2">
                <SectionTitle>Constraints</SectionTitle>
                <p className="text-sm text-secondary">{cr.constraints_text}</p>
              </div>
            )}
            {cr.acceptance_criteria_text && (
              <div>
                <SectionTitle>Acceptance criteria</SectionTitle>
                <p className="text-sm text-secondary">{cr.acceptance_criteria_text}</p>
              </div>
            )}
          </Card>
        )}

        {busy && cr.status === "draft" && (
          <Card className="flex items-center gap-2 text-sm text-secondary">
            <Loader2 size={15} className="animate-spin text-signal" /> Inspecting the repository and drafting a plan…
          </Card>
        )}

        {cr.brief && <BriefView brief={cr.brief} status={cr.status} busy={busy} onApprove={() => action(() => buildApi.approveScope(crId))} />}

        {cr.status === "scope_approved" && (
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-success" />
              <p className="text-sm text-text">
                Scope approved — <span className="font-mono text-xs">{cr.approved_scope?.files.length ?? 0}</span> file(s). The agent
                can now edit only these.
              </p>
            </div>
            <Button variant="primary" onClick={() => action(() => buildApi.execute(crId))} disabled={busy}>
              {busy ? "Starting…" : "Start agent"}
            </Button>
          </Card>
        )}

        {cr.run && (cr.status === "executing" || cr.status === "paused_needs_approval") && (
          <ExecutionView run={cr.run} status={cr.status} busy={busy}
            onExpand={(paths) => action(() => buildApi.expandApproval(crId, paths))}
            onDiscard={() => action(() => buildApi.review(crId, "discarded"))}
          />
        )}

        {cr.run && ["awaiting_review", "pr_created", "revision_requested", "discarded"].includes(cr.status) && (
          <ReviewView
            cr={cr}
            run={cr.run}
            busy={busy}
            onDecision={(d) => action(() => buildApi.review(crId, d))}
            onReExecute={() => action(() => buildApi.execute(crId))}
            onNewRequest={() => router.push("/build/new")}
          />
        )}
      </div>
    </BuildShell>
  );
}

function pillFor(status: string): string {
  if (["awaiting_review", "pr_created"].includes(status)) return "done";
  if (status === "failed") return "failed";
  if (status === "paused_needs_approval") return "paused";
  if (status === "executing") return "running";
  return "pending";
}

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1">
      {STAGES.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={s} className="flex items-center gap-1 flex-1">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                active ? "bg-signalLight text-signal" : done ? "text-success" : "text-muted"
              }`}
            >
              {done ? <Check size={12} /> : active ? <CircleDot size={12} /> : <span className="w-3 h-3 rounded-full border border-current inline-block" />}
              {s}
            </div>
            {i < STAGES.length - 1 && <div className={`h-px flex-1 ${done ? "bg-success/40" : "bg-border"}`} />}
          </div>
        );
      })}
    </div>
  );
}

function BriefView({
  brief,
  status,
  busy,
  onApprove,
}: {
  brief: BuildBrief;
  status: string;
  busy: boolean;
  onApprove: () => void;
}) {
  const canApprove = status === "brief_ready";
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle>Change brief {brief.provider ? `· via ${brief.provider}` : ""}</SectionTitle>
        {status === "brief_ready" && <StatusPill status="pending">Plan only — no code touched</StatusPill>}
      </div>

      <div>
        <p className="text-xs font-mono text-muted uppercase tracking-wide">Goal</p>
        <p className="text-sm text-text mt-0.5">{brief.goal}</p>
      </div>
      <div>
        <p className="text-xs font-mono text-muted uppercase tracking-wide">Proposed approach</p>
        <p className="text-sm text-secondary mt-0.5 leading-relaxed">{brief.approach}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-mono text-muted uppercase tracking-wide mb-1.5">Files likely to change</p>
          <div className="space-y-1">
            {brief.files_likely_to_change.map((f) => (
              <div key={f.path} className="text-sm">
                <span className="font-mono text-xs text-signal">{f.path}</span>
                {f.reason && <span className="text-xs text-muted ml-2">{f.reason}</span>}
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-mono text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1">
            <ShieldAlert size={12} className="text-gap" /> Files explicitly protected
          </p>
          <div className="flex flex-wrap gap-1">
            {brief.files_protected.map((p) => (
              <span key={p} className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-gap/10 text-gap border border-gap/20">
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>

      {brief.reuse.length > 0 && (
        <div>
          <p className="text-xs font-mono text-muted uppercase tracking-wide mb-1">Reuse existing</p>
          {brief.reuse.map((r, i) => (
            <p key={i} className="text-sm text-secondary">
              <span className="font-mono text-xs text-text">{r.path || r.name}</span>
              {r.why ? ` — ${r.why}` : ""}
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Impact label="API impact" value={brief.api_impact} />
        <Impact label="Database impact" value={brief.database_impact} />
        <Impact label="Auth impact" value={brief.auth_impact} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ListBlock title="Risks" items={brief.risks} />
        <ListBlock title="Assumptions" items={brief.assumptions} />
        <ListBlock title="Acceptance criteria" items={brief.acceptance_criteria} />
        <ListBlock title="Tests to run" items={brief.tests_to_run} mono />
      </div>

      <div>
        <p className="text-xs font-mono text-muted uppercase tracking-wide">Rollback plan</p>
        <p className="text-sm text-secondary mt-0.5">{brief.rollback_plan}</p>
      </div>

      {canApprove && (
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
          <p className="text-xs text-muted">Approving grants the agent permission to edit only the files listed above.</p>
          <Button variant="primary" onClick={onApprove} disabled={busy}>
            <ShieldCheck size={14} /> Approve scope
          </Button>
        </div>
      )}
    </Card>
  );
}

function Impact({ label, value }: { label: string; value: string }) {
  const none = (value || "").trim().toLowerCase() === "none";
  return (
    <div className={`rounded-lg border px-3 py-2 ${none ? "border-border bg-raised/40" : "border-warning/30 bg-warning/5"}`}>
      <p className="text-[11px] font-mono uppercase tracking-wide text-muted">{label}</p>
      <p className={`text-sm mt-0.5 ${none ? "text-success" : "text-warning"}`}>{value || "None"}</p>
    </div>
  );
}

function ListBlock({ title, items, mono }: { title: string; items: string[]; mono?: boolean }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-mono text-muted uppercase tracking-wide mb-1">{title}</p>
      <ul className="space-y-0.5">
        {items.map((it, i) => (
          <li key={i} className={`text-sm text-secondary ${mono ? "font-mono text-xs" : ""}`}>
            • {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function stepIcon(status: string) {
  if (status === "done") return <Check size={14} className="text-success" />;
  if (status === "failed") return <X size={14} className="text-gap" />;
  if (status === "running") return <Loader2 size={14} className="animate-spin text-signal" />;
  if (status === "skipped") return <CircleDot size={14} className="text-muted" />;
  return <span className="w-3.5 h-3.5 rounded-full border border-muted inline-block" />;
}

function ExecutionView({
  run,
  status,
  busy,
  onExpand,
  onDiscard,
}: {
  run: BuildRun;
  status: string;
  busy: boolean;
  onExpand: (paths: string[]) => void;
  onDiscard: () => void;
}) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle>Execution · {run.branch_name}</SectionTitle>
        <StatusPill status={run.status === "running" ? "running" : run.status}>{run.status}</StatusPill>
      </div>

      <div className="space-y-1.5">
        {run.steps.map((s) => (
          <div key={s.key} className="flex items-start gap-2.5">
            <span className="mt-0.5">{stepIcon(s.status)}</span>
            <div className="min-w-0">
              <p className={`text-sm ${s.status === "pending" ? "text-muted" : "text-text"}`}>{s.label}</p>
              {s.detail && <p className="text-xs text-muted font-mono">{s.detail}</p>}
            </div>
          </div>
        ))}
      </div>

      {status === "paused_needs_approval" && run.pending_out_of_scope.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
          <p className="text-sm font-semibold text-warning flex items-center gap-1.5 mb-1">
            <ShieldAlert size={15} /> Paused — the agent needs files outside the approved scope
          </p>
          <div className="space-y-1 my-2">
            {run.pending_out_of_scope.map((p) => (
              <p key={p.path} className="text-sm">
                <span className="font-mono text-xs text-warning">{p.path}</span>
                <span className="text-xs text-muted ml-2">{p.reason}</span>
              </p>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => onExpand(run.pending_out_of_scope.filter((p) => p.reason !== "protected").map((p) => p.path))}
            >
              Approve expanded scope &amp; continue
            </Button>
            <Button variant="danger" size="sm" onClick={onDiscard} disabled={busy}>
              Discard
            </Button>
          </div>
          <p className="text-[11px] text-muted mt-2">Protected paths can never be approved for editing and are excluded automatically.</p>
        </div>
      )}
    </Card>
  );
}

const CHECK_ORDER = ["tests", "lint", "typecheck", "build"];

function ReviewView({
  cr,
  run,
  busy,
  onDecision,
  onReExecute,
  onNewRequest,
}: {
  cr: ChangeRequestDetail;
  run: BuildRun;
  busy: boolean;
  onDecision: (d: "pr_created" | "revision_requested" | "discarded") => void;
  onReExecute: () => void;
  onNewRequest: () => void;
}) {
  const verifs = [...run.verifications].sort((a, b) => CHECK_ORDER.indexOf(a.check_name) - CHECK_ORDER.indexOf(b.check_name));
  const allPassed = verifs.filter((v) => v.status !== "skipped").every((v) => v.status === "passed");
  const terminal = ["pr_created", "revision_requested", "discarded"].includes(cr.status);
  const pr = cr.pr_links?.[0];

  return (
    <div className="space-y-5">
      {cr.status === "revision_requested" && (
        <Card className="flex items-center justify-between gap-3">
          <p className="text-sm text-secondary">Revision requested. Re-run the agent on the approved scope to produce a new diff.</p>
          <Button variant="primary" size="sm" onClick={onReExecute} disabled={busy}>
            Re-run agent
          </Button>
        </Card>
      )}
      {cr.status === "discarded" && (
        <Card className="flex items-center justify-between gap-3">
          <p className="text-sm text-secondary">Branch discarded. Nothing was merged; main is untouched.</p>
          <Button variant="secondary" size="sm" onClick={onNewRequest}>
            New change request
          </Button>
        </Card>
      )}

      {pr && (
        <Card className="border-success/30 bg-success/5">
          <div className="flex items-center gap-2 mb-2">
            <GitPullRequestArrow size={16} className="text-success" />
            <p className="text-sm font-semibold text-text">{pr.title}</p>
            {pr.is_simulation && (
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/30">
                simulation
              </span>
            )}
          </div>
          <pre className="text-xs text-secondary whitespace-pre-wrap font-mono bg-surface border border-border rounded-lg p-3">{pr.body}</pre>
          <p className="text-[11px] text-muted mt-2">
            GitHub write access isn’t configured, so no real PR was opened. The branch and diff are real and on disk.
          </p>
        </Card>
      )}

      <Card>
        <SectionTitle>Verification</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {verifs.map((v) => (
            <div key={v.id} className={`rounded-lg border px-3 py-2 ${v.status === "passed" ? "border-success/30 bg-success/5" : v.status === "failed" ? "border-gap/30 bg-gap/5" : "border-border bg-raised/40"}`}>
              <div className="flex items-center gap-1.5">
                <FlaskConical size={13} className={v.status === "passed" ? "text-success" : v.status === "failed" ? "text-gap" : "text-muted"} />
                <p className="text-sm font-medium text-text capitalize">{v.check_name}</p>
              </div>
              <StatusPill status={v.status}>{v.status}</StatusPill>
              {v.command && <p className="text-[10px] font-mono text-muted mt-1 truncate">{v.command}</p>}
            </div>
          ))}
        </div>
        {!allPassed && (
          <p className="text-xs text-gap mt-2">Some checks failed — review the output below before creating a PR. The agent does not claim success.</p>
        )}
      </Card>

      <Card>
        <SectionTitle>Files changed ({run.changed_files.length})</SectionTitle>
        <div className="space-y-4">
          {run.changed_files.map((f) => (
            <div key={f.id}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-mono text-xs text-signal">{f.path}</span>
                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-raised text-secondary border border-border">{f.change_type}</span>
                <span className="text-[11px] font-mono text-success">+{f.additions}</span>
                <span className="text-[11px] font-mono text-gap">-{f.deletions}</span>
              </div>
              {f.reason && <p className="text-xs text-muted mb-1.5">{f.reason}</p>}
              <DiffView diff={f.diff} />
            </div>
          ))}
        </div>
      </Card>

      {verifs.length > 0 && (
        <Card>
          <SectionTitle>Command output</SectionTitle>
          <div className="space-y-2">
            {verifs.map((v) => (
              <details key={v.id} className="rounded-lg border border-border">
                <summary className="cursor-pointer px-3 py-2 text-sm text-secondary flex items-center gap-2">
                  <span className="capitalize font-medium text-text">{v.check_name}</span>
                  <StatusPill status={v.status}>{v.status}</StatusPill>
                  <span className="text-[11px] text-muted ml-auto">{v.duration_ms}ms</span>
                </summary>
                <pre className="text-[11px] font-mono text-secondary whitespace-pre-wrap px-3 py-2 border-t border-border bg-raised/40 max-h-56 overflow-y-auto">
                  {v.output || "(no output)"}
                </pre>
              </details>
            ))}
          </div>
        </Card>
      )}

      {!terminal && cr.status === "awaiting_review" && (
        <Card className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="danger" onClick={() => onDecision("discarded")} disabled={busy}>
            <Trash2 size={14} /> Discard branch
          </Button>
          <Button variant="secondary" onClick={() => onDecision("revision_requested")} disabled={busy}>
            <RotateCcw size={14} /> Request revision
          </Button>
          <Button variant="primary" onClick={() => onDecision("pr_created")} disabled={busy}>
            <GitPullRequestArrow size={14} /> Create PR
          </Button>
        </Card>
      )}
    </div>
  );
}
