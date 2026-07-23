"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { GitBranch, RefreshCw, Plus, ShieldCheck, Boxes, Clock } from "lucide-react";
import { buildApi, BuildRepo, ChangeRequestDetail } from "@/lib/api";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import ErrorPanel from "@/components/ui/ErrorPanel";
import BuildShell, { SectionTitle, StatusPill } from "@/components/build/BuildShell";
import FileTree from "@/components/build/FileTree";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  brief_ready: "Brief ready",
  scope_approved: "Scope approved",
  executing: "Executing",
  paused_needs_approval: "Needs approval",
  awaiting_review: "Awaiting review",
  pr_created: "PR created",
  revision_requested: "Revision requested",
  discarded: "Discarded",
  failed: "Failed",
};

export default function BuildOverviewPage() {
  const router = useRouter();
  const [repo, setRepo] = useState<BuildRepo | null>(null);
  const [requests, setRequests] = useState<ChangeRequestDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const repos = await buildApi.listRepos();
      if (repos.length > 0) {
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
  }

  useEffect(() => {
    load();
  }, []);

  async function connectDemo() {
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

  return (
    <BuildShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text tracking-tight">Build Workspace</h1>
        <p className="text-sm text-secondary mt-1">
          Describe the change. Review the plan. Approve the scope. Inspect the diff.
        </p>
        <p className="text-xs text-muted mt-1 max-w-2xl">
          A scoped, review-gated coding agent — never an unrestricted rewrite. It plans before it touches
          code, edits only files you approve, and backs every claim with real test, lint, typecheck, and build results.
        </p>
      </div>

      {error != null && (
        <div className="mb-4">
          <ErrorPanel error={error as Error} title="Build Workspace error" />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : !repo ? (
        <Card className="text-center py-14">
          <Boxes size={28} className="mx-auto text-signal mb-3" />
          <p className="text-base font-semibold text-text">Connect a repository</p>
          <p className="text-sm text-secondary mt-1 mb-5 max-w-md mx-auto">
            GitHub write access isn’t configured, so branch and PR creation run in{" "}
            <span className="font-mono text-warning">simulation</span> mode against a local demo repository.
            Indexing, briefs, edits, and verification are all real.
          </p>
          <Button variant="primary" onClick={connectDemo} disabled={busy}>
            {busy ? "Provisioning…" : "Use local demo repository"}
          </Button>
        </Card>
      ) : (
        <div className="space-y-5">
          <RepoHeader repo={repo} busy={busy} onReindex={reindex} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-5">
              <StackCard repo={repo} />
              {repo.index?.architecture_summary && (
                <Card>
                  <SectionTitle>Architecture summary</SectionTitle>
                  <p className="text-sm text-secondary leading-relaxed">{repo.index.architecture_summary}</p>
                </Card>
              )}
              <ImportantAreasCard repo={repo} />
              <ProtectedCard repo={repo} onChange={load} />
              <CommitsCard repo={repo} />
            </div>

            <div className="space-y-5">
              <Card>
                <SectionTitle>File tree</SectionTitle>
                {repo.index && <FileTree tree={repo.index.file_tree} protectedPatterns={repo.protected_paths.map((p) => p.pattern)} />}
              </Card>
            </div>
          </div>

          <ChangeRequestsCard repo={repo} requests={requests} onNew={() => router.push("/build/new")} statusLabel={STATUS_LABEL} />
        </div>
      )}
    </BuildShell>
  );
}

function RepoHeader({ repo, busy, onReindex }: { repo: BuildRepo; busy: boolean; onReindex: () => void }) {
  const idx = repo.index;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-text">{repo.name}</h2>
            <span className="inline-flex items-center gap-1 text-xs text-secondary font-mono">
              <GitBranch size={13} /> {repo.default_branch}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <StatusPill status={idx?.status === "ready" ? "done" : idx?.status ?? "pending"}>
              {idx?.status === "ready" ? "Indexed" : idx?.status ?? "not indexed"}
            </StatusPill>
            <span className="text-xs text-muted">
              {idx?.file_count ?? 0} files · {idx?.indexed_at ? `indexed ${new Date(idx.indexed_at).toLocaleString()}` : "not indexed yet"}
            </span>
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/30">
              {repo.source === "local_demo" ? "local demo · simulation" : repo.source}
            </span>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onReindex} disabled={busy}>
          <RefreshCw size={13} className={busy ? "animate-spin" : ""} /> Re-index
        </Button>
      </div>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[11px] font-mono text-muted uppercase tracking-wide">{label}</p>
      <p className="text-sm text-text font-mono mt-0.5">{value || "—"}</p>
    </div>
  );
}

function StackCard({ repo }: { repo: BuildRepo }) {
  return (
    <Card>
      <SectionTitle>Detected stack &amp; commands</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Field label="Language" value={repo.detected_stack?.language} />
        <Field label="Framework" value={repo.detected_stack?.framework} />
        <Field label="Package manager" value={repo.package_manager} />
        <Field label="Test" value={repo.test_command} />
        <Field label="Lint" value={repo.lint_command} />
        <Field label="Typecheck" value={repo.typecheck_command} />
        <Field label="Build" value={repo.build_command} />
      </div>
    </Card>
  );
}

function ImportantAreasCard({ repo }: { repo: BuildRepo }) {
  const areas = repo.index?.important_areas ?? {};
  const entries = Object.entries(areas).filter(([, v]) => Array.isArray(v) && v.length > 0);
  if (entries.length === 0) return null;
  return (
    <Card>
      <SectionTitle>Important areas</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {entries.map(([key, dirs]) => (
          <div key={key}>
            <p className="text-xs font-medium text-text capitalize">{key}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {dirs.map((d) => (
                <span key={d} className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-raised text-secondary border border-border">
                  {d}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ProtectedCard({ repo, onChange }: { repo: BuildRepo; onChange: () => void }) {
  const [pattern, setPattern] = useState("");
  const [adding, setAdding] = useState(false);

  async function add() {
    if (!pattern.trim()) return;
    setAdding(true);
    try {
      await buildApi.addProtected(repo.id, pattern.trim(), "Manually protected");
      setPattern("");
      onChange();
    } finally {
      setAdding(false);
    }
  }
  async function remove(pid: string) {
    await buildApi.deleteProtected(pid);
    onChange();
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck size={14} className="text-gap" />
        <SectionTitle>Protected paths (agent may never edit)</SectionTitle>
      </div>
      <div className="space-y-1.5">
        {repo.protected_paths.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <span className="font-mono text-xs text-gap">{p.pattern}</span>
              {p.reason && <span className="text-xs text-muted ml-2">{p.reason}</span>}
            </div>
            <button onClick={() => remove(p.id)} className="text-xs text-muted hover:text-gap shrink-0">
              remove
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="e.g. billing/**"
          className="flex-1 rounded-[10px] border border-border bg-surface px-2.5 py-1.5 text-xs font-mono outline-none focus:border-signal/60"
        />
        <Button variant="secondary" size="sm" onClick={add} disabled={adding}>
          <Plus size={12} /> Add
        </Button>
      </div>
    </Card>
  );
}

function CommitsCard({ repo }: { repo: BuildRepo }) {
  const commits = repo.index?.recent_commits ?? [];
  if (commits.length === 0) return null;
  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <Clock size={14} className="text-secondary" />
        <SectionTitle>Recent commits</SectionTitle>
      </div>
      <div className="space-y-1.5">
        {commits.map((c) => (
          <div key={c.sha} className="flex items-baseline gap-2 text-sm">
            <span className="font-mono text-xs text-signal shrink-0">{c.sha.slice(0, 7)}</span>
            <span className="text-secondary truncate">{c.message}</span>
            <span className="text-[11px] text-muted ml-auto shrink-0">{c.date}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ChangeRequestsCard({
  repo,
  requests,
  onNew,
  statusLabel,
}: {
  repo: BuildRepo;
  requests: ChangeRequestDetail[];
  onNew: () => void;
  statusLabel: Record<string, string>;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionTitle>Change requests</SectionTitle>
        <Button variant="primary" size="sm" onClick={onNew}>
          <Plus size={13} /> New change request
        </Button>
      </div>
      {requests.length === 0 ? (
        <p className="text-sm text-muted">No change requests yet. Describe a change to get started.</p>
      ) : (
        <div className="space-y-2">
          {requests.map((cr) => (
            <Link key={cr.id} href={`/build/requests/${cr.id}`}>
              <motion.div
                whileHover={{ y: -1 }}
                className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 hover:border-signal/40 hover:bg-raised/40"
              >
                <div className="min-w-0">
                  <p className="text-sm text-text truncate">{cr.request_text}</p>
                  <p className="text-[11px] font-mono text-muted mt-0.5">
                    {cr.risk_level} risk{cr.branch_name ? ` · ${cr.branch_name}` : ""}
                  </p>
                </div>
                <StatusPill status={cr.status === "pr_created" || cr.status === "awaiting_review" ? "done" : cr.status === "failed" ? "failed" : "pending"}>
                  {statusLabel[cr.status] ?? cr.status}
                </StatusPill>
              </motion.div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
