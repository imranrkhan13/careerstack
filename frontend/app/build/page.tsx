"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  GitBranch,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  TriangleAlert,
  Lock,
  EyeOff,
  Loader2,
  Check,
  X,
  CircleDot,
  GitMerge,
  RotateCcw,
  Trash2,
  Terminal as TerminalIcon,
  Send,
  Plus,
  ArrowLeft,
  Sparkles,
  FileCode,
} from "lucide-react";
import { buildApi, BuildRepo, ChangeRequestDetail, BuildRun } from "@/lib/api";
import Button from "@/components/ui/Button";
import ErrorPanel from "@/components/ui/ErrorPanel";
import IdeFileTree, { classifyPath, PathSeverity } from "@/components/build/ide/IdeFileTree";

const CodeViewer = dynamic(() => import("@/components/build/ide/CodeViewer"), {
  ssr: false,
  loading: () => <div className="p-4 text-xs text-muted">Loading editor…</div>,
});
const CodeDiff = dynamic(() => import("@/components/build/ide/CodeDiff"), {
  ssr: false,
  loading: () => <div className="p-4 text-xs text-muted">Loading diff…</div>,
});

type SelectedFile = {
  path: string;
  content: string | null;
  severity: PathSeverity;
  editable: boolean;
} | null;

export default function IdePage() {
  const [repo, setRepo] = useState<BuildRepo | null>(null);
  const [requests, setRequests] = useState<ChangeRequestDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const [selected, setSelected] = useState<SelectedFile>(null);
  const [activeCr, setActiveCr] = useState<ChangeRequestDetail | null>(null);
  const [command, setCommand] = useState("");
  const [constraints, setConstraints] = useState("");
  const [risk, setRisk] = useState("low");
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [confirmMerge, setConfirmMerge] = useState(false);
  const pathWarned = useRef<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const loadRepo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const repos = await buildApi.listRepos();
      if (repos.length) {
        setRepo(repos[0]);
        setRequests(await buildApi.listChangeRequests(repos[0].id));
      } else {
        setRepo(null);
      }
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRepo();
  }, [loadRepo]);

  // Poll while the agent executes.
  useEffect(() => {
    if (activeCr?.status !== "executing") return;
    const t = setInterval(async () => {
      try {
        const { run, change_request_status } = await buildApi.getRun(activeCr.id);
        setActiveCr((prev) => (prev ? { ...prev, run, status: change_request_status } : prev));
        if (["completed", "failed", "paused"].includes(run.status)) {
          clearInterval(t);
          const full = await buildApi.getChangeRequest(activeCr.id);
          setActiveCr(full);
          setTerminalOpen(true);
          const first = full.run?.changed_files?.[0];
          if (first) selectChangedFile(full, first.path);
        }
      } catch {
        /* keep polling */
      }
    }, 1500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCr?.status, activeCr?.id]);

  const changedPaths = useMemo(
    () => new Set((activeCr?.run?.changed_files ?? []).map((c) => c.path)),
    [activeCr]
  );

  function selectChangedFile(cr: ChangeRequestDetail, path: string) {
    setSelected({ path, content: null, severity: "normal", editable: true });
  }

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const r = await buildApi.createRepo();
      setRepo(r);
      setRequests([]);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function reindex() {
    if (!repo) return;
    setBusy(true);
    try {
      setRepo(await buildApi.reindex(repo.id));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function openFile(path: string, sev: PathSeverity) {
    setSelected({ path, content: null, severity: sev, editable: sev === "normal" });
    if (sev === "secret") {
      setWarning(`${path} is a secrets file — its contents are hidden from the editor and from the AI agent entirely.`);
      return;
    }
    if (sev === "blocked") {
      setWarning(`${path} is protected and cannot be edited by the AI agent.`);
    } else if (sev === "restricted") {
      setWarning(`${path} is restricted (e.g. API route). The AI can edit it only if you explicitly approve it.`);
    } else {
      setWarning(null);
    }
    if (!repo) return;
    try {
      const f = await buildApi.getFile(repo.id, path);
      setSelected({ path, content: f.content, severity: sev, editable: f.editable });
    } catch (e) {
      setError(e);
    }
  }

  function newCommand() {
    setActiveCr(null);
    setSelected(null);
    setConfirmMerge(false);
    setWarning(null);
    loadRepo();
  }

  async function run<T>(fn: () => Promise<T>, after?: (r: T) => void) {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      after?.(r);
      return r;
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function generatePlan() {
    if (!repo || !command.trim()) return;
    setConfirmMerge(false);
    await run(
      async () => {
        const cr = await buildApi.createChangeRequest(repo.id, {
          request_text: command.trim(),
          constraints_text: constraints.trim() || undefined,
          risk_level: risk,
        });
        return buildApi.generateBrief(cr.id);
      },
      (cr) => setActiveCr(cr)
    );
  }

  async function openRequest(id: string) {
    await run(
      () => buildApi.getChangeRequest(id),
      (full) => {
        setActiveCr(full);
        const first = full.run?.changed_files?.[0];
        if (first) selectChangedFile(full, first.path);
      }
    );
  }

  if (loading) {
    return <div className="h-screen flex items-center justify-center text-sm text-muted">Loading Build Workspace…</div>;
  }

  if (!repo) {
    return <ConnectScreen busy={busy} onConnect={connect} error={error} />;
  }

  const selectedChanged = selected ? (activeCr?.run?.changed_files ?? []).find((c) => c.path === selected.path) : null;

  return (
    <div className="h-screen flex flex-col bg-bg text-text overflow-hidden">
      <TopBar repo={repo} branch={activeCr?.branch_name} busy={busy} onReindex={reindex} />

      <div className="flex-1 flex min-h-0">
        {/* Left: file tree */}
        <aside className="w-64 shrink-0 border-r border-border flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wide text-muted">Explorer</span>
            <span className="text-[10px] font-mono text-muted">{repo.index?.file_count ?? 0} files</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <IdeFileTree
              tree={repo.index?.file_tree ?? null}
              protectedPaths={repo.protected_paths}
              selected={selected?.path ?? null}
              onSelect={openFile}
            />
          </div>
          <ProtectedLegend />
        </aside>

        {/* Center: editor / diff + terminal */}
        <section className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="h-9 border-b border-border flex items-center px-3 gap-2 shrink-0">
              {selected ? (
                <>
                  <FileCode size={13} className="text-muted" />
                  <span className="text-xs font-mono text-secondary truncate">{selected.path}</span>
                  {selectedChanged && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-signalLight text-signal">DIFF vs main</span>}
                  {selected.severity === "blocked" && <Badge tone="gap"><Lock size={9} /> protected</Badge>}
                  {selected.severity === "restricted" && <Badge tone="warn"><TriangleAlert size={9} /> restricted</Badge>}
                  {selected.severity === "secret" && <Badge tone="gap"><EyeOff size={9} /> secret</Badge>}
                </>
              ) : (
                <span className="text-xs text-muted">Select a file, or type a command on the right to start.</span>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              {warning && (
                <div className="m-3 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning flex items-center gap-2">
                  <ShieldAlert size={14} /> {warning}
                </div>
              )}
              {selectedChanged ? (
                <CodeDiff oldValue={selectedChanged.old_content ?? ""} newValue={selectedChanged.new_content ?? ""} filename={selected?.path} />
              ) : selected?.severity === "secret" ? (
                <div className="p-6 text-sm text-muted flex items-center gap-2">
                  <EyeOff size={16} /> Contents hidden — secrets are never shown to the editor or the AI agent.
                </div>
              ) : selected && selected.content !== null ? (
                <div className="h-full">
                  <CodeViewer value={selected.content} filename={selected.path} />
                </div>
              ) : selected ? (
                <div className="p-6 text-sm text-muted">Loading…</div>
              ) : (
                <EmptyEditor />
              )}
            </div>
          </div>

          <Terminal open={terminalOpen} onToggle={() => setTerminalOpen((v) => !v)} run={activeCr?.run ?? null} status={activeCr?.status} />
        </section>

        {/* Right: command + plan + execution + review */}
        <aside className="w-[400px] shrink-0 border-l border-border flex flex-col min-h-0 bg-surface">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wide text-muted flex items-center gap-1.5">
              <Sparkles size={12} className="text-signal" /> AI agent
            </span>
            {activeCr && (
              <button onClick={newCommand} className="text-[11px] text-muted hover:text-signal flex items-center gap-1">
                <Plus size={11} /> New command
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {error != null && <ErrorPanel error={error as Error} title="Something went wrong" />}

            {!activeCr && (
              <Composer
                command={command}
                setCommand={setCommand}
                constraints={constraints}
                setConstraints={setConstraints}
                risk={risk}
                setRisk={setRisk}
                busy={busy}
                onSubmit={generatePlan}
                requests={requests}
                onOpen={openRequest}
              />
            )}

            {activeCr && (
              <ActivePanel
                cr={activeCr}
                busy={busy}
                confirmMerge={confirmMerge}
                setConfirmMerge={setConfirmMerge}
                onApprove={() => run(() => buildApi.approveScope(activeCr.id), setActiveCr)}
                onExecute={() => run(() => buildApi.execute(activeCr.id), setActiveCr)}
                onExpand={(paths) => run(() => buildApi.expandApproval(activeCr.id, paths), setActiveCr)}
                onReview={(d) => run(() => buildApi.review(activeCr.id, d), (cr) => { setActiveCr(cr); setConfirmMerge(false); })}
                onOpenFile={(p) => {
                  const sev = classifyPath(p, false, repo.protected_paths);
                  openFile(p, sev);
                }}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------- pieces ------------------------------- */

function Badge({ tone, children }: { tone: "gap" | "warn" | "ok"; children: React.ReactNode }) {
  const cls = tone === "gap" ? "bg-gap/10 text-gap" : tone === "warn" ? "bg-warning/10 text-warning" : "bg-success/10 text-success";
  return <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded ${cls}`}>{children}</span>;
}

function TopBar({ repo, branch, busy, onReindex }: { repo: BuildRepo; branch?: string | null; busy: boolean; onReindex: () => void }) {
  return (
    <header className="h-12 shrink-0 border-b border-border flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <Link href="/today" className="text-muted hover:text-text flex items-center gap-1 text-sm">
          <ArrowLeft size={14} /> CareerStack
        </Link>
        <span className="text-muted">/</span>
        <span className="text-sm font-semibold text-text">Build Workspace IDE</span>
        <span className="text-sm text-secondary font-mono flex items-center gap-1 ml-2">
          <FileCode size={13} className="text-signal" /> {repo.name}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded-full border border-signal/30 bg-signalLight/40 text-signal">
          <GitBranch size={12} /> {branch || repo.default_branch}
        </span>
        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/30">simulation</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted">
          {repo.detected_stack?.framework} · {repo.package_manager}
        </span>
        <Button variant="secondary" size="sm" onClick={onReindex} disabled={busy}>
          <RefreshCw size={12} className={busy ? "animate-spin" : ""} /> Re-index
        </Button>
      </div>
    </header>
  );
}

function ProtectedLegend() {
  return (
    <div className="px-3 py-2 border-t border-border space-y-1">
      <p className="text-[10px] font-mono uppercase tracking-wide text-muted mb-1">Protection</p>
      <div className="flex items-center gap-1.5 text-[11px] text-secondary"><Lock size={10} className="text-gap" /> blocked (never editable)</div>
      <div className="flex items-center gap-1.5 text-[11px] text-secondary"><TriangleAlert size={10} className="text-warning" /> restricted (needs approval)</div>
      <div className="flex items-center gap-1.5 text-[11px] text-secondary"><EyeOff size={10} className="text-gap" /> secret (hidden from AI)</div>
    </div>
  );
}

function EmptyEditor() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-8">
      <Sparkles size={26} className="text-signal mb-3" />
      <p className="text-base font-semibold text-text">A senior engineer that plans before it codes</p>
      <p className="text-sm text-secondary mt-1 max-w-md">
        Describe a change on the right. The agent writes a plan, you approve the scope, it edits only approved files on a
        branch, and every change is backed by real test / lint / typecheck / build results.
      </p>
      <p className="text-xs text-muted mt-3 font-mono">Describe the change · Review the plan · Approve the scope · Inspect the diff</p>
    </div>
  );
}

const RISKS = ["low", "medium", "high"];

function Composer({
  command,
  setCommand,
  constraints,
  setConstraints,
  risk,
  setRisk,
  busy,
  onSubmit,
  requests,
  onOpen,
}: {
  command: string;
  setCommand: (v: string) => void;
  constraints: string;
  setConstraints: (v: string) => void;
  risk: string;
  setRisk: (v: string) => void;
  busy: boolean;
  onSubmit: () => void;
  requests: ChangeRequestDetail[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-secondary mb-1.5">Tell the agent what to build, in plain English:</p>
        <textarea
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          rows={4}
          placeholder='e.g. "Add a dark mode toggle to the landing page" — do not change auth, billing, APIs, or the database.'
          className="w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-signal/60 resize-none"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onSubmit();
          }}
        />
      </div>
      <input
        value={constraints}
        onChange={(e) => setConstraints(e.target.value)}
        placeholder="Constraints (optional): Do not change…"
        className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs outline-none focus:border-signal/60"
      />
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-mono uppercase text-muted">Risk</span>
        {RISKS.map((r) => (
          <button
            key={r}
            onClick={() => setRisk(r)}
            className={`text-xs px-2 py-1 rounded-md capitalize ${risk === r ? "bg-signalLight text-signal" : "text-muted hover:text-text"}`}
          >
            {r}
          </button>
        ))}
      </div>
      <Button variant="primary" onClick={onSubmit} disabled={busy || !command.trim()} className="w-full">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Generate change plan
      </Button>

      {requests.length > 0 && (
        <div className="pt-2 border-t border-border">
          <p className="text-[11px] font-mono uppercase tracking-wide text-muted mb-1.5">Recent commands</p>
          <div className="space-y-1">
            {requests.slice(0, 8).map((r) => (
              <button
                key={r.id}
                onClick={() => onOpen(r.id)}
                className="w-full text-left rounded-lg border border-border px-2.5 py-2 hover:border-signal/40 hover:bg-raised/40"
              >
                <p className="text-xs text-text truncate">{r.request_text}</p>
                <p className="text-[10px] font-mono text-muted mt-0.5">{r.status.replace(/_/g, " ")}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function stepIcon(status: string) {
  if (status === "done") return <Check size={13} className="text-success" />;
  if (status === "failed") return <X size={13} className="text-gap" />;
  if (status === "running") return <Loader2 size={13} className="animate-spin text-signal" />;
  if (status === "skipped") return <CircleDot size={13} className="text-muted" />;
  return <span className="w-3 h-3 rounded-full border border-muted inline-block" />;
}

function ActivePanel({
  cr,
  busy,
  confirmMerge,
  setConfirmMerge,
  onApprove,
  onExecute,
  onExpand,
  onReview,
  onOpenFile,
}: {
  cr: ChangeRequestDetail;
  busy: boolean;
  confirmMerge: boolean;
  setConfirmMerge: (v: boolean) => void;
  onApprove: () => void;
  onExecute: () => void;
  onExpand: (paths: string[]) => void;
  onReview: (d: "merged" | "revision_requested" | "discarded") => void;
  onOpenFile: (path: string) => void;
}) {
  const brief = cr.brief;
  const run = cr.run;
  const verifs = run?.verifications ?? [];
  const allPassed = verifs.filter((v) => v.status !== "skipped").every((v) => v.status === "passed");

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-bg px-3 py-2">
        <p className="text-sm text-text">{cr.request_text}</p>
        <p className="text-[10px] font-mono text-muted mt-1">{cr.status.replace(/_/g, " ")}{cr.branch_name ? ` · ${cr.branch_name}` : ""}</p>
      </div>

      {cr.status === "draft" && (
        <div className="flex items-center gap-2 text-sm text-secondary">
          <Loader2 size={14} className="animate-spin text-signal" /> Inspecting repo and drafting a plan…
        </div>
      )}

      {brief && (
        <div className="rounded-lg border border-border p-3 space-y-2.5">
          <p className="text-[11px] font-mono uppercase tracking-wide text-muted">Change plan {brief.provider ? `· ${brief.provider}` : ""}</p>
          <p className="text-sm text-text">{brief.goal}</p>
          <p className="text-xs text-secondary leading-relaxed">{brief.approach}</p>

          <div>
            <p className="text-[11px] font-mono text-muted uppercase mb-1">Files to change</p>
            {brief.files_likely_to_change.map((f) => (
              <button key={f.path} onClick={() => onOpenFile(f.path)} className="block text-left w-full">
                <span className="font-mono text-xs text-signal hover:underline">{f.path}</span>
                {f.reason && <span className="text-[11px] text-muted ml-1">— {f.reason}</span>}
              </button>
            ))}
          </div>

          <div>
            <p className="text-[11px] font-mono text-muted uppercase mb-1 flex items-center gap-1"><ShieldAlert size={11} className="text-gap" /> Protected (blocked)</p>
            <div className="flex flex-wrap gap-1">
              {brief.files_protected.map((p) => (
                <span key={p} className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-gap/10 text-gap border border-gap/20">{p}</span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {[["API", brief.api_impact], ["DB", brief.database_impact], ["Auth", brief.auth_impact]].map(([k, v]) => {
              const none = (v || "").toLowerCase() === "none";
              return (
                <div key={k} className={`rounded px-2 py-1 text-center ${none ? "bg-raised" : "bg-warning/10"}`}>
                  <p className="text-[9px] font-mono uppercase text-muted">{k}</p>
                  <p className={`text-[11px] ${none ? "text-success" : "text-warning"}`}>{v}</p>
                </div>
              );
            })}
          </div>

          {cr.status === "brief_ready" && (
            <Button variant="primary" className="w-full" onClick={onApprove} disabled={busy}>
              <ShieldCheck size={14} /> Approve scope
            </Button>
          )}
        </div>
      )}

      {cr.status === "scope_approved" && (
        <div className="rounded-lg border border-success/30 bg-success/5 p-3">
          <p className="text-sm text-text flex items-center gap-1.5 mb-2">
            <ShieldCheck size={15} className="text-success" /> Scope approved — {cr.approved_scope?.files.length ?? 0} file(s)
          </p>
          <Button variant="primary" className="w-full" onClick={onExecute} disabled={busy}>
            Start agent
          </Button>
        </div>
      )}

      {run && (cr.status === "executing" || cr.status === "paused_needs_approval") && (
        <div className="rounded-lg border border-border p-3">
          <p className="text-[11px] font-mono uppercase tracking-wide text-muted mb-2">Execution · {run.branch_name}</p>
          <div className="space-y-1.5">
            {run.steps.map((s) => (
              <div key={s.key} className="flex items-start gap-2">
                <span className="mt-0.5">{stepIcon(s.status)}</span>
                <div className="min-w-0">
                  <p className={`text-xs ${s.status === "pending" ? "text-muted" : "text-text"}`}>{s.label}</p>
                  {s.detail && <p className="text-[10px] text-muted font-mono truncate">{s.detail}</p>}
                </div>
              </div>
            ))}
          </div>

          {cr.status === "paused_needs_approval" && run.pending_out_of_scope.length > 0 && (
            <div className="mt-3 rounded-lg border border-warning/40 bg-warning/5 p-2.5">
              <p className="text-xs font-semibold text-warning flex items-center gap-1 mb-1">
                <ShieldAlert size={13} /> Needs expanded approval
              </p>
              {run.pending_out_of_scope.map((p) => (
                <p key={p.path} className="text-[11px] font-mono text-warning">{p.path} <span className="text-muted">({p.reason})</span></p>
              ))}
              <div className="flex gap-2 mt-2">
                <Button variant="secondary" size="sm" disabled={busy}
                  onClick={() => onExpand(run.pending_out_of_scope.filter((p) => p.reason !== "protected").map((p) => p.path))}>
                  Approve &amp; continue
                </Button>
                <Button variant="danger" size="sm" onClick={() => onReview("discarded")} disabled={busy}>Discard</Button>
              </div>
              <p className="text-[10px] text-muted mt-1.5">Protected paths are excluded automatically and can never be approved.</p>
            </div>
          )}
        </div>
      )}

      {run && ["awaiting_review", "merged", "revision_requested", "discarded"].includes(cr.status) && (
        <div className="rounded-lg border border-border p-3 space-y-3">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-wide text-muted mb-1.5">Verification</p>
            <div className="grid grid-cols-2 gap-1.5">
              {["tests", "lint", "typecheck", "build"].map((name) => {
                const v = verifs.find((x) => x.check_name === name);
                const st = v?.status ?? "skipped";
                return (
                  <div key={name} className={`rounded px-2 py-1 flex items-center justify-between ${st === "passed" ? "bg-success/10" : st === "failed" ? "bg-gap/10" : "bg-raised"}`}>
                    <span className="text-xs capitalize text-text">{name}</span>
                    <span className={`text-[10px] font-mono uppercase ${st === "passed" ? "text-success" : st === "failed" ? "text-gap" : "text-muted"}`}>{st}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-mono uppercase tracking-wide text-muted mb-1.5">Files changed</p>
            {(run.changed_files ?? []).map((f) => (
              <button key={f.id} onClick={() => onOpenFile(f.path)} className="flex items-center gap-2 w-full text-left py-0.5">
                <span className="font-mono text-xs text-signal hover:underline truncate">{f.path}</span>
                <span className="text-[10px] font-mono text-success">+{f.additions}</span>
                <span className="text-[10px] font-mono text-gap">-{f.deletions}</span>
              </button>
            ))}
          </div>

          {cr.status === "awaiting_review" && (
            <div className="space-y-2 pt-1">
              {!allPassed && (
                <p className="text-[11px] text-gap flex items-center gap-1"><TriangleAlert size={12} /> Some checks failed — review the terminal before merging.</p>
              )}
              {!confirmMerge ? (
                <Button variant="primary" className="w-full" onClick={() => setConfirmMerge(true)} disabled={busy}>
                  <GitMerge size={14} /> Merge to main
                </Button>
              ) : (
                <div className="rounded-lg border border-signal/40 bg-signalLight/40 p-2">
                  <p className="text-xs text-text mb-2">Merge <span className="font-mono">{cr.branch_name}</span> into main?</p>
                  <div className="flex gap-2">
                    <Button variant="primary" size="sm" onClick={() => onReview("merged")} disabled={busy}>Confirm merge</Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmMerge(false)}>Cancel</Button>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => onReview("revision_requested")} disabled={busy}>
                  <RotateCcw size={13} /> Revise
                </Button>
                <Button variant="danger" size="sm" className="flex-1" onClick={() => onReview("discarded")} disabled={busy}>
                  <Trash2 size={13} /> Discard
                </Button>
              </div>
            </div>
          )}

          {cr.status === "merged" && (
            <p className="text-sm text-success flex items-center gap-1.5"><GitMerge size={15} /> Merged into main.</p>
          )}
          {cr.status === "revision_requested" && (
            <Button variant="primary" size="sm" className="w-full" onClick={onExecute} disabled={busy}>Re-run agent</Button>
          )}
          {cr.status === "discarded" && <p className="text-sm text-secondary flex items-center gap-1.5"><Trash2 size={14} /> Branch discarded. main untouched.</p>}
        </div>
      )}
    </div>
  );
}

const CHECK_ORDER = ["tests", "lint", "typecheck", "build"];

function Terminal({ open, onToggle, run, status }: { open: boolean; onToggle: () => void; run: BuildRun | null; status?: string }) {
  const verifs = run ? [...run.verifications].sort((a, b) => CHECK_ORDER.indexOf(a.check_name) - CHECK_ORDER.indexOf(b.check_name)) : [];
  return (
    <div className={`border-t border-border shrink-0 flex flex-col ${open ? "h-56" : "h-9"}`}>
      <button onClick={onToggle} className="h-9 shrink-0 px-3 flex items-center gap-2 text-[11px] font-mono uppercase tracking-wide text-muted hover:text-text">
        <TerminalIcon size={13} /> Verification output
        {status === "executing" && <Loader2 size={12} className="animate-spin text-signal" />}
        {verifs.length > 0 && (
          <span className="ml-auto flex gap-2">
            {verifs.map((v) => (
              <span key={v.id} className={v.status === "passed" ? "text-success" : v.status === "failed" ? "text-gap" : "text-muted"}>
                {v.check_name}:{v.status}
              </span>
            ))}
          </span>
        )}
      </button>
      {open && (
        <div className="flex-1 overflow-y-auto bg-[#15151c] text-[#d6d6dd] font-mono text-[11px] p-3 space-y-2">
          {verifs.length === 0 ? (
            <p className="text-[#7a7a85]">{status === "executing" ? "Running verification…" : "No verification output yet. Run a command to see real test/lint/typecheck/build results."}</p>
          ) : (
            verifs.map((v) => (
              <div key={v.id}>
                <div className="flex items-center gap-2">
                  <span className="text-[#5b8cff]">$</span>
                  <span className="text-[#e6e6ea]">{v.command || v.check_name}</span>
                  <span className={v.status === "passed" ? "text-[#4fd18b]" : v.status === "failed" ? "text-[#ff6b6b]" : "text-[#7a7a85]"}>
                    [{v.status}] {v.duration_ms}ms
                  </span>
                </div>
                <pre className="whitespace-pre-wrap text-[#b8b8c2] mt-0.5">{v.output || "(no output)"}</pre>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ConnectScreen({ busy, onConnect, error }: { busy: boolean; onConnect: () => void; error: unknown }) {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-bg px-6">
      <Sparkles size={30} className="text-signal mb-3" />
      <h1 className="text-xl font-bold text-text">Build Workspace IDE</h1>
      <p className="text-sm text-secondary mt-1 mb-6 max-w-md text-center">
        A personal AI coding environment with a safety layer: scoped change plans, protected-path blocking, branch
        isolation, and real verification. Connect a repository to begin.
      </p>
      {error != null && <div className="mb-4 w-full max-w-md"><ErrorPanel error={error as Error} /></div>}
      <Button variant="primary" onClick={onConnect} disabled={busy}>
        {busy ? "Provisioning…" : "Connect local demo repository"}
      </Button>
      <p className="text-xs text-muted mt-3">GitHub write access isn’t configured — branch/PR/merge run in labeled simulation.</p>
    </div>
  );
}
