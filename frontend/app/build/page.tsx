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
  Menu,
  MessageSquare,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Keyboard,
  Files,
  GitBranch as GitBranchIcon,
  CheckCircle2,
  Copy,
  FolderGit2,
} from "lucide-react";
import { buildApi, BuildRepo, ChangeRequestDetail, BuildRun } from "@/lib/api";
import Button from "@/components/ui/Button";
import ErrorPanel from "@/components/ui/ErrorPanel";
import Skeleton from "@/components/ui/Skeleton";
import IdeFileTree, { classifyPath, PathSeverity } from "@/components/build/ide/IdeFileTree";
import Toasts, { ToastItem, ToastTone, useToastTimers } from "@/components/build/ide/Toasts";
import ShortcutsModal from "@/components/build/ide/ShortcutsModal";
import { HistItem, loadHistory, mergeServer, upsertHistory } from "@/components/build/ide/history";

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
  loading: boolean;
  error: unknown;
} | null;

let toastSeq = 0;

export default function IdePage() {
  const [repo, setRepo] = useState<BuildRepo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [indexError, setIndexError] = useState<unknown>(null);
  const [commandError, setCommandError] = useState<unknown>(null);

  const [selected, setSelected] = useState<SelectedFile>(null);
  const [activeCr, setActiveCr] = useState<ChangeRequestDetail | null>(null);
  const [command, setCommand] = useState("");
  const [constraints, setConstraints] = useState("");
  const [risk, setRisk] = useState("low");
  const [confirmMerge, setConfirmMerge] = useState(false);
  const [history, setHistory] = useState<HistItem[]>([]);

  const [terminalOpen, setTerminalOpen] = useState(true);
  const [treeOpen, setTreeOpen] = useState(true); // desktop
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  const [rightSheetOpen, setRightSheetOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [focusCheck, setFocusCheck] = useState<string | null>(null);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dismissToast = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const addToast = useCallback((tone: ToastTone, message: string) => {
    setToasts((t) => [...t, { id: `t${++toastSeq}`, tone, message }]);
  }, []);
  useToastTimers(toasts, dismissToast);

  // ---- data loading ----
  const loadRepo = useCallback(async () => {
    setLoading(true);
    setIndexError(null);
    try {
      const repos = await buildApi.listRepos();
      if (repos.length) {
        setRepo(repos[0]);
        const reqs = await buildApi.listChangeRequests(repos[0].id);
        setHistory((h) => mergeServer(h, reqs.map((r) => ({ id: r.id, request_text: r.request_text, status: r.status }))));
      } else {
        setRepo(null);
      }
    } catch (e) {
      setIndexError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setHistory(loadHistory());
    loadRepo();
  }, [loadRepo]);

  // keep history in sync with the active change request's status
  useEffect(() => {
    if (activeCr) setHistory((h) => upsertHistory(h, { id: activeCr.id, text: activeCr.request_text, status: activeCr.status }));
  }, [activeCr?.id, activeCr?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // start closed on tablet-width, open on desktop
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) setTreeOpen(false);
  }, []);

  // ---- polling during execution ----
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
          if (first) selectPath(first.path);
          if (run.status === "failed") addToast("error", "Execution failed. See the failed step and re-run.");
        }
      } catch {
        /* keep polling */
      }
    }, 1500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCr?.status, activeCr?.id]);

  const changedFiles = activeCr?.run?.changed_files ?? [];
  const changedPaths = useMemo(() => new Set(changedFiles.map((c) => c.path)), [changedFiles]);
  const selectedChanged = selected ? changedFiles.find((c) => c.path === selected.path) : null;

  // ---- file selection ----
  const selectPath = useCallback(
    async (path: string, hintSev: PathSeverity = "normal") => {
      const isChanged = changedPaths.has(path);
      setSelected({ path, content: null, severity: hintSev, editable: hintSev === "normal", loading: !isChanged, error: null });
      if (isChanged) return; // diff view uses stored old/new content
      if (hintSev === "secret") {
        setSelected({ path, content: null, severity: "secret", editable: false, loading: false, error: null });
        return;
      }
      if (!repo) return;
      try {
        const f = await buildApi.getFile(repo.id, path);
        const sev: PathSeverity = f.secret ? "secret" : f.protected ? "blocked" : f.restricted ? "restricted" : "normal";
        setSelected({ path, content: f.content, severity: sev, editable: f.editable, loading: false, error: null });
      } catch (e) {
        setSelected({ path, content: null, severity: hintSev, editable: false, loading: false, error: e });
      }
    },
    [changedPaths, repo]
  );

  const changedIndex = selected ? changedFiles.findIndex((c) => c.path === selected.path) : -1;
  const gotoChanged = useCallback(
    (delta: number) => {
      if (changedFiles.length === 0) return;
      const base = changedIndex >= 0 ? changedIndex : 0;
      const next = (base + delta + changedFiles.length) % changedFiles.length;
      selectPath(changedFiles[next].path);
    },
    [changedFiles, changedIndex, selectPath]
  );

  // ---- actions ----
  async function connect() {
    setBusy(true);
    setIndexError(null);
    try {
      const r = await buildApi.createRepo();
      setRepo(r);
      setHistory([]);
      addToast("success", "Repository connected and indexed.");
      setTimeout(() => addToast("info", "Type a command on the right to start. Try: “Add dark mode toggle to the landing page”."), 400);
    } catch (e) {
      setIndexError(e);
      addToast("error", "Could not connect the repository.");
    } finally {
      setBusy(false);
    }
  }

  async function reindex() {
    if (!repo) return;
    setBusy(true);
    setIndexError(null);
    try {
      setRepo(await buildApi.reindex(repo.id));
      addToast("success", "Repository re-indexed.");
    } catch (e) {
      setIndexError(e);
      addToast("error", "Re-index failed.");
    } finally {
      setBusy(false);
    }
  }

  async function generatePlan() {
    if (!repo || !command.trim()) return;
    setConfirmMerge(false);
    setCommandError(null);
    setBusy(true);
    try {
      const cr = await buildApi.createChangeRequest(repo.id, {
        request_text: command.trim(),
        constraints_text: constraints.trim() || undefined,
        risk_level: risk,
      });
      const withBrief = await buildApi.generateBrief(cr.id);
      setActiveCr(withBrief);
      setRightSheetOpen(true);
    } catch (e) {
      setCommandError(e);
      addToast("error", "Could not generate the change plan.");
    } finally {
      setBusy(false);
    }
  }

  async function act<T>(fn: () => Promise<T>, after?: (r: T) => void, errMsg?: string) {
    setBusy(true);
    try {
      const r = await fn();
      after?.(r);
      return r;
    } catch (e) {
      addToast("error", errMsg || "Action failed.");
      setCommandError(e);
    } finally {
      setBusy(false);
    }
  }

  function onReview(d: "merged" | "revision_requested" | "discarded") {
    act(
      () => buildApi.review(activeCr!.id, d),
      (cr) => {
        setActiveCr(cr);
        setConfirmMerge(false);
        if (d === "merged") addToast("success", `Merged ${cr.branch_name} into main. Changes are live.`);
        if (d === "discarded") addToast("info", "Branch discarded. Main branch untouched.");
        if (d === "revision_requested") addToast("info", "Revision requested. Re-run the agent to produce a new diff.");
      }
    );
  }

  function newCommand() {
    setActiveCr(null);
    setSelected(null);
    setConfirmMerge(false);
    setCommand("");
    setCommandError(null);
    loadRepo();
  }

  async function openRequest(id: string) {
    setRightSheetOpen(true);
    await act(
      () => buildApi.getChangeRequest(id),
      (full) => {
        setActiveCr(full);
        const first = full.run?.changed_files?.[0];
        if (first) selectPath(first.path);
      }
    );
  }

  function viewFullOutput(check: string) {
    setTerminalOpen(true);
    setFocusCheck(check);
  }

  // ---- keyboard shortcuts (attached once; reads latest via ref) ----
  const kb = useRef<Record<string, () => void>>({});
  const kbState = useRef({ shortcutsOpen, toastsLen: toasts.length, rightSheetOpen });
  kbState.current = { shortcutsOpen, toastsLen: toasts.length, rightSheetOpen };
  kb.current = {
    submit: () => { if (!activeCr) generatePlan(); },
    toggleTree: () => setTreeOpen((v) => !v),
    toggleTerminal: () => setTerminalOpen((v) => !v),
    openDiff: () => { if (changedFiles.length) selectPath((selectedChanged ? selected!.path : changedFiles[0].path)); },
    help: () => setShortcutsOpen(true),
  };
  useEffect(() => {
    function typing(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    }
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") {
        if (kbState.current.shortcutsOpen) setShortcutsOpen(false);
        else if (kbState.current.toastsLen) setToasts([]);
        else if (kbState.current.rightSheetOpen) setRightSheetOpen(false);
        return;
      }
      if (meta && e.key === "Enter") { e.preventDefault(); kb.current.submit(); return; }
      if (meta && (e.key === "b" || e.key === "B")) { e.preventDefault(); kb.current.toggleTree(); return; }
      if (meta && (e.key === "t" || e.key === "T")) { e.preventDefault(); kb.current.toggleTerminal(); return; }
      if (meta && (e.key === "d" || e.key === "D")) { e.preventDefault(); kb.current.openDiff(); return; }
      if (e.key === "?" && !typing(e)) { e.preventDefault(); kb.current.help(); return; }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- render ----
  if (loading) return <FullscreenLoading />;
  if (!repo) return <Landing busy={busy} onConnect={connect} error={indexError} onRetry={loadRepo} />;

  return (
    <div className="h-screen flex flex-col bg-bg text-text overflow-hidden">
      <Toasts toasts={toasts} onDismiss={dismissToast} />
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}

      <TopBar
        repo={repo}
        branch={activeCr?.branch_name}
        busy={busy}
        onReindex={reindex}
        onToggleTree={() => setMobileTreeOpen((v) => !v)}
        onToggleRight={() => setRightSheetOpen((v) => !v)}
        onHelp={() => setShortcutsOpen(true)}
      />

      {indexError != null && (
        <div className="px-4 py-2 border-b border-gap/30 bg-gap/5 flex items-center justify-between gap-3">
          <span className="text-xs text-gap">Indexing error — the repository index may be stale.</span>
          <Button variant="secondary" size="sm" onClick={reindex} disabled={busy}><RefreshCw size={12} /> Re-index</Button>
        </div>
      )}

      <div className="flex-1 flex min-h-0 relative">
        {mobileTreeOpen && <div className="lg:hidden fixed inset-0 z-30 bg-black/20" onClick={() => setMobileTreeOpen(false)} />}

        {/* Left: file tree */}
        <aside
          className={`${mobileTreeOpen ? "flex" : "hidden"} ${treeOpen ? "lg:flex" : "lg:hidden"} flex-col w-64 shrink-0 border-r border-border bg-surface min-h-0
            max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:top-12 max-lg:z-40 max-lg:shadow-2xl`}
        >
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wide text-muted flex items-center gap-1.5"><Files size={12} className="text-signal" /> Explorer</span>
            <span className="text-[10px] font-mono text-muted">{repo.index?.file_count ?? 0} files</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {repo.index?.file_tree ? (
              <IdeFileTree
                tree={repo.index.file_tree}
                protectedPaths={repo.protected_paths}
                selected={selected?.path ?? null}
                onSelect={(p, sev) => { selectPath(p, sev); setMobileTreeOpen(false); }}
              />
            ) : (
              <TreeSkeleton />
            )}
          </div>
          <ProtectedLegend />
        </aside>

        {/* Center: editor / diff + terminal */}
        <section className="flex-1 flex flex-col min-w-0">
          <EditorPane
            selected={selected}
            selectedChanged={selectedChanged}
            changedCount={changedFiles.length}
            changedIndex={changedIndex}
            onPrev={() => gotoChanged(-1)}
            onNext={() => gotoChanged(1)}
            onRetry={() => selected && selectPath(selected.path)}
          />
          <Terminal
            open={terminalOpen}
            onToggle={() => setTerminalOpen((v) => !v)}
            run={activeCr?.run ?? null}
            status={activeCr?.status}
            focusCheck={focusCheck}
            onFocusHandled={() => setFocusCheck(null)}
          />
        </section>

        {/* Right: command + plan + execution + review */}
        {rightSheetOpen && <div className="lg:hidden fixed inset-0 z-30 bg-black/20" onClick={() => setRightSheetOpen(false)} />}
        <aside
          className={`${rightSheetOpen ? "flex" : "hidden"} lg:flex flex-col w-[400px] shrink-0 border-l border-border bg-surface min-h-0
            max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:top-16 max-lg:w-full max-lg:z-40 max-lg:rounded-t-2xl max-lg:shadow-2xl max-lg:border-l-0 max-lg:border-t`}
        >
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wide text-muted flex items-center gap-1.5">
              <Sparkles size={12} className="text-signal" /> Agent
            </span>
            <div className="flex items-center gap-3">
              {activeCr && (
                <button onClick={newCommand} className="text-[11px] text-muted hover:text-signal flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 rounded px-1">
                  <Plus size={11} /> New command
                </button>
              )}
              <button onClick={() => setRightSheetOpen(false)} className="lg:hidden text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 rounded" aria-label="Close panel"><X size={14} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {!activeCr && (
              <Composer
                command={command}
                setCommand={setCommand}
                constraints={constraints}
                setConstraints={setConstraints}
                risk={risk}
                setRisk={setRisk}
                busy={busy}
                error={commandError}
                onDismissError={() => setCommandError(null)}
                onSubmit={generatePlan}
                history={history}
                onOpen={openRequest}
              />
            )}

            {activeCr && (
              <ActivePanel
                cr={activeCr}
                busy={busy}
                confirmMerge={confirmMerge}
                setConfirmMerge={setConfirmMerge}
                onApprove={() => act(() => buildApi.approveScope(activeCr.id), setActiveCr)}
                onExecute={() => act(() => buildApi.execute(activeCr.id), setActiveCr)}
                onExpand={(paths) => act(() => buildApi.expandApproval(activeCr.id, paths), setActiveCr)}
                onReview={onReview}
                onBack={newCommand}
                onOpenFile={(p) => selectPath(p, classifyPath(p, false, repo.protected_paths))}
                onViewOutput={viewFullOutput}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------- pieces ------------------------------- */

function FullscreenLoading() {
  return (
    <div className="h-screen flex flex-col bg-bg">
      <div className="h-12 border-b border-border flex items-center px-4"><Skeleton className="h-5 w-64" /></div>
      <div className="flex-1 flex">
        <div className="w-64 border-r border-border p-3 space-y-2">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
        <div className="flex-1 p-6"><Skeleton className="h-full w-full rounded-xl" /></div>
        <div className="w-[400px] border-l border-border p-3 space-y-3"><Skeleton className="h-24 w-full rounded-xl" /><Skeleton className="h-40 w-full rounded-xl" /></div>
      </div>
    </div>
  );
}

function TreeSkeleton() {
  const rows = [
    { d: 0, w: "w-24" }, { d: 1, w: "w-20" }, { d: 1, w: "w-28" }, { d: 0, w: "w-16" },
    { d: 1, w: "w-24" }, { d: 2, w: "w-20" }, { d: 2, w: "w-16" }, { d: 1, w: "w-24" },
    { d: 0, w: "w-20" }, { d: 1, w: "w-28" }, { d: 0, w: "w-16" },
  ];
  return (
    <div className="py-2 space-y-2" aria-hidden>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2" style={{ paddingLeft: r.d * 12 + 8 }}>
          <Skeleton className="h-3 w-3 rounded-sm" />
          <Skeleton className={`h-3 ${r.w}`} />
        </div>
      ))}
    </div>
  );
}

function CodeSkeleton() {
  const lines = [
    { i: 0, w: "w-1/3" }, { i: 1, w: "w-2/3" }, { i: 1, w: "w-1/2" }, { i: 2, w: "w-3/5" },
    { i: 2, w: "w-2/5" }, { i: 1, w: "w-1/2" }, { i: 0, w: "w-1/4" }, { i: 0, w: "w-1/2" },
    { i: 1, w: "w-3/5" }, { i: 2, w: "w-1/3" }, { i: 1, w: "w-2/5" }, { i: 0, w: "w-1/3" },
  ];
  return (
    <div className="p-4 space-y-2.5" aria-hidden>
      {lines.map((l, idx) => (
        <div key={idx} className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-border w-6 text-right select-none">{idx + 1}</span>
          <div className="flex-1" style={{ paddingLeft: l.i * 16 }}><Skeleton className={`h-3 ${l.w}`} /></div>
        </div>
      ))}
    </div>
  );
}

function TerminalSkeleton() {
  const rows = ["w-40", "w-3/4", "w-1/2", "w-2/3", "w-1/3"];
  return (
    <div className="p-3 space-y-2 animate-pulse" style={{ fontFamily: MONO_STACK }} aria-hidden>
      {rows.map((w, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[#3a3a44]">$</span>
          <div className={`h-3 rounded bg-[#2a2a33] ${w}`} />
        </div>
      ))}
    </div>
  );
}

function Badge({ tone, children }: { tone: "gap" | "warn" | "ok"; children: React.ReactNode }) {
  const cls = tone === "gap" ? "bg-gap/10 text-gap" : tone === "warn" ? "bg-warning/10 text-warning" : "bg-success/10 text-success";
  return <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded ${cls}`}>{children}</span>;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: "drafting", cls: "bg-raised text-muted" },
  brief_ready: { label: "brief ready", cls: "bg-signalLight text-signal" },
  scope_approved: { label: "scope approved", cls: "bg-success/10 text-success" },
  executing: { label: "executing", cls: "bg-signalLight text-signal" },
  paused_needs_approval: { label: "needs approval", cls: "bg-warning/10 text-warning" },
  awaiting_review: { label: "review", cls: "bg-signalLight text-signal" },
  merged: { label: "merged", cls: "bg-success/10 text-success" },
  revision_requested: { label: "revision", cls: "bg-warning/10 text-warning" },
  discarded: { label: "discarded", cls: "bg-raised text-muted" },
  failed: { label: "failed", cls: "bg-gap/10 text-gap" },
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status.replace(/_/g, " "), cls: "bg-raised text-muted" };
  return <span className={`inline-flex items-center text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded ${m.cls}`}>{m.label}</span>;
}

const MONO_STACK = "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, monospace";

function TopBar({
  repo, branch, busy, onReindex, onToggleTree, onToggleRight, onHelp,
}: {
  repo: BuildRepo; branch?: string | null; busy: boolean;
  onReindex: () => void; onToggleTree: () => void; onToggleRight: () => void; onHelp: () => void;
}) {
  return (
    <header className="h-12 shrink-0 border-b border-border flex items-center justify-between px-3 sm:px-4 gap-2">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button onClick={onToggleTree} className="lg:hidden text-muted hover:text-text p-1 focus-visible:ring-2 focus-visible:ring-signal/40 rounded" aria-label="Toggle file tree"><Menu size={17} /></button>
        <Link href="/today" className="text-muted hover:text-text hidden sm:flex items-center gap-1 text-sm shrink-0"><ArrowLeft size={14} /> CareerStack</Link>
        <span className="text-muted hidden sm:inline">/</span>
        <span className="text-sm font-semibold text-text shrink-0">Build IDE</span>
        <span className="text-sm text-secondary font-mono items-center gap-1 ml-1 hidden md:flex truncate"><FileCode size={13} className="text-signal" /> {repo.name}</span>
        <span className="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded-full border border-signal/30 bg-signalLight/40 text-signal shrink-0">
          <GitBranch size={12} /> <span className="max-w-[120px] truncate">{branch || repo.default_branch}</span>
        </span>
        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/30 shrink-0 hidden sm:inline">simulation</span>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <span className="text-xs text-muted hidden lg:inline">{repo.detected_stack?.framework} · {repo.package_manager}</span>
        <button onClick={onHelp} className="text-muted hover:text-text p-1 focus-visible:ring-2 focus-visible:ring-signal/40 rounded" aria-label="Keyboard shortcuts"><Keyboard size={16} /></button>
        <Button variant="secondary" size="sm" onClick={onReindex} disabled={busy}><RefreshCw size={12} className={busy ? "animate-spin" : ""} /> <span className="hidden sm:inline">Re-index</span></Button>
        <button onClick={onToggleRight} className="lg:hidden text-signal p-1 focus-visible:ring-2 focus-visible:ring-signal/40 rounded" aria-label="Toggle AI panel"><MessageSquare size={17} /></button>
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

function EditorPane({
  selected, selectedChanged, changedCount, changedIndex, onPrev, onNext, onRetry,
}: {
  selected: SelectedFile;
  selectedChanged: BuildRun["changed_files"][number] | null | undefined;
  changedCount: number;
  changedIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copyDiff() {
    if (!selectedChanged?.diff) return;
    try {
      await navigator.clipboard.writeText(selectedChanged.diff);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="h-9 border-b border-border flex items-center px-3 gap-2 shrink-0 overflow-x-auto">
        <span className="text-[11px] font-mono uppercase tracking-wide text-muted flex items-center gap-1.5 shrink-0"><FileCode size={12} className="text-signal" /> Editor</span>
        {selected && <span className="text-border shrink-0">│</span>}
        {selected ? (
          <>
            <span className="text-xs font-mono text-secondary truncate">{selected.path}</span>
            {selectedChanged && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-signalLight text-signal shrink-0">DIFF vs main</span>}
            {selected.severity === "blocked" && <Badge tone="gap"><Lock size={9} /> protected</Badge>}
            {selected.severity === "restricted" && <Badge tone="warn"><TriangleAlert size={9} /> restricted</Badge>}
            {selected.severity === "secret" && <Badge tone="gap"><EyeOff size={9} /> secret</Badge>}
            {selectedChanged && (
              <div className="ml-auto flex items-center gap-1.5 shrink-0">
                {changedCount > 1 && (
                  <>
                    <span className="text-[10px] font-mono text-muted">{changedIndex + 1}/{changedCount} changed</span>
                    <button onClick={onPrev} className="text-muted hover:text-text p-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40" aria-label="Previous changed file"><ChevronLeft size={14} /></button>
                    <button onClick={onNext} className="text-muted hover:text-text p-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40" aria-label="Next changed file"><ChevronRight size={14} /></button>
                  </>
                )}
                <button onClick={copyDiff} className="flex items-center gap-1 text-[10px] font-mono text-muted hover:text-signal border border-border rounded px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40" aria-label="Copy diff">
                  {copied ? <><Check size={11} className="text-success" /> Copied</> : <><Copy size={11} /> Copy diff</>}
                </button>
              </div>
            )}
          </>
        ) : (
          <span className="text-xs text-muted">Select a file, or type a command to start.</span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {!selected ? (
          <EmptyEditor />
        ) : selected.loading ? (
          <CodeSkeleton />
        ) : selected.error ? (
          <div className="m-4 rounded-lg border border-gap/30 bg-gap/5 p-4">
            <p className="text-sm font-semibold text-gap mb-1">Couldn’t load {selected.path}</p>
            <p className="text-xs text-secondary mb-3">The file request failed. This is non-blocking — try again.</p>
            <Button variant="secondary" size="sm" onClick={onRetry}><RefreshCw size={12} /> Retry</Button>
          </div>
        ) : selectedChanged ? (
          <CodeDiff oldValue={selectedChanged.old_content ?? ""} newValue={selectedChanged.new_content ?? ""} filename={selected.path} />
        ) : selected.severity === "secret" ? (
          <div className="p-6 text-sm text-muted flex items-center gap-2"><EyeOff size={16} /> Contents hidden — secrets are never shown to the editor or the AI agent.</div>
        ) : selected.content !== null ? (
          <div className="h-full flex flex-col">
            {selected.severity === "blocked" && (
              <div className="m-3 rounded-lg border border-gap/40 bg-gap/5 px-3 py-2 text-xs text-gap flex items-center gap-2"><Lock size={13} /> This file is protected and cannot be edited by the AI agent (read-only).</div>
            )}
            {selected.severity === "restricted" && (
              <div className="m-3 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning flex items-center gap-2"><TriangleAlert size={13} /> This file requires explicit approval for AI edits.</div>
            )}
            <div className="flex-1 min-h-0"><CodeViewer value={selected.content} filename={selected.path} /></div>
          </div>
        ) : (
          <div className="p-6 text-sm text-muted">This file is empty.</div>
        )}
      </div>
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
  command, setCommand, constraints, setConstraints, risk, setRisk, busy, error, onDismissError, onSubmit, history, onOpen,
}: {
  command: string; setCommand: (v: string) => void; constraints: string; setConstraints: (v: string) => void;
  risk: string; setRisk: (v: string) => void; busy: boolean; error: unknown; onDismissError: () => void;
  onSubmit: () => void; history: HistItem[]; onOpen: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {error != null && (
        <div className="rounded-lg border border-gap/30 bg-gap/5 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold text-gap">Couldn’t generate the plan</p>
            <button onClick={onDismissError} className="text-muted hover:text-gap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 rounded"><X size={13} /></button>
          </div>
          <p className="text-[11px] text-secondary mt-1">The request failed — this is non-blocking.</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={onSubmit} disabled={busy}><RefreshCw size={12} /> Retry</Button>
        </div>
      )}

      <div className="rounded-xl border border-border bg-gradient-to-b from-surface to-bg p-3 space-y-2">
        <p className="text-xs text-secondary">Tell the agent what to build, in plain English:</p>
        <textarea
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          rows={4}
          placeholder='e.g. "Add a dark mode toggle to the landing page" — do not change auth, billing, APIs, or the database.'
          className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-signal/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/30 resize-none"
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onSubmit(); }}
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted">⌘/Ctrl + Enter to submit</span>
          <span className="text-[10px] font-mono text-muted">{command.length} chars</span>
        </div>
        <input
          value={constraints}
          onChange={(e) => setConstraints(e.target.value)}
          placeholder="Constraints (optional): Do not change…"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-signal/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/30"
        />
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono uppercase text-muted">Risk</span>
          {RISKS.map((r) => (
            <button key={r} onClick={() => setRisk(r)} className={`text-xs px-2 py-1 rounded-md capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 ${risk === r ? "bg-signalLight text-signal" : "text-muted hover:text-text"}`}>{r}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={onSubmit} disabled={busy || !command.trim()} className="flex-1">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Generate change plan
          </Button>
          <span className="text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded bg-raised text-muted shrink-0">{command.trim() ? "ready" : "new"}</span>
        </div>
      </div>
      <p className="text-[10px] text-muted text-center">Press ? for keyboard shortcuts</p>

      <div className="pt-1">
        <p className="text-[11px] font-mono uppercase tracking-wide text-muted mb-1.5">Recent commands</p>
        {history.length === 0 ? (
          <div className="flex flex-col items-center text-center py-6 text-muted">
            <Sparkles size={22} className="text-signal/70 mb-2" />
            <p className="text-xs">Describe a change to get started.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {history.slice(0, 5).map((r) => (
              <button key={r.id} onClick={() => onOpen(r.id)} className="w-full text-left rounded-lg border border-border px-2.5 py-2 hover:border-signal/40 hover:bg-raised/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 flex items-center justify-between gap-2">
                <span className="text-xs text-text truncate">{r.text}</span>
                <StatusBadge status={r.status} />
              </button>
            ))}
          </div>
        )}
      </div>
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
  cr, busy, confirmMerge, setConfirmMerge, onApprove, onExecute, onExpand, onReview, onBack, onOpenFile, onViewOutput,
}: {
  cr: ChangeRequestDetail; busy: boolean; confirmMerge: boolean; setConfirmMerge: (v: boolean) => void;
  onApprove: () => void; onExecute: () => void; onExpand: (paths: string[]) => void;
  onReview: (d: "merged" | "revision_requested" | "discarded") => void; onBack: () => void;
  onOpenFile: (path: string) => void; onViewOutput: (check: string) => void;
}) {
  const brief = cr.brief;
  const run = cr.run;
  const verifs = run?.verifications ?? [];
  const graded = verifs.filter((v) => v.status !== "skipped");
  const passedCount = graded.filter((v) => v.status === "passed").length;
  const allPassed = graded.length > 0 && passedCount === graded.length;
  const failedStep = run?.steps?.find((s) => s.status === "failed");

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-bg px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-text">{cr.request_text}</p>
          <StatusBadge status={cr.status} />
        </div>
        {cr.branch_name && <p className="text-[10px] font-mono text-muted mt-1">{cr.branch_name}</p>}
      </div>

      {cr.status === "draft" && (
        <div className="flex items-center gap-2 text-sm text-secondary"><Loader2 size={14} className="animate-spin text-signal" /> Inspecting repo and drafting a plan…</div>
      )}

      {cr.status === "failed" && (
        <div className="rounded-lg border border-gap/30 bg-gap/5 p-3">
          <p className="text-sm font-semibold text-gap flex items-center gap-1.5"><ShieldAlert size={14} /> Execution failed</p>
          {failedStep && <p className="text-xs text-secondary mt-1">Failed at: <span className="font-mono">{failedStep.label}</span>{failedStep.detail ? ` — ${failedStep.detail}` : ""}</p>}
          <Button variant="primary" size="sm" className="mt-2 w-full" onClick={onExecute} disabled={busy}><RotateCcw size={13} /> Re-run agent</Button>
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
              <button key={f.path} onClick={() => onOpenFile(f.path)} className="block text-left w-full focus-visible:ring-2 focus-visible:ring-signal/40 rounded">
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
            <Button variant="primary" className="w-full pulse-ring" onClick={onApprove} disabled={busy}><ShieldCheck size={14} /> Approve scope</Button>
          )}
        </div>
      )}

      {cr.status === "scope_approved" && (
        <div className="rounded-lg border border-success/30 bg-success/5 p-3">
          <p className="text-sm text-text flex items-center gap-1.5 mb-2"><ShieldCheck size={15} className="text-success" /> Scope approved — {cr.approved_scope?.files.length ?? 0} file(s)</p>
          <Button variant="primary" className="w-full" onClick={onExecute} disabled={busy}>Start agent</Button>
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
              <p className="text-xs font-semibold text-warning flex items-center gap-1 mb-1"><ShieldAlert size={13} /> Needs expanded approval</p>
              {run.pending_out_of_scope.map((p) => (
                <p key={p.path} className="text-[11px] font-mono text-warning">{p.path} <span className="text-muted">({p.reason})</span></p>
              ))}
              <div className="flex gap-2 mt-2">
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => onExpand(run.pending_out_of_scope.filter((p) => p.reason !== "protected").map((p) => p.path))}>Approve &amp; continue</Button>
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
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] font-mono uppercase tracking-wide text-muted">Verification</p>
              <p className={`text-[11px] font-mono ${allPassed ? "text-success" : "text-gap"}`}>{allPassed ? "All checks passed ✓" : `${passedCount}/${graded.length} checks passed`}</p>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {["tests", "lint", "typecheck", "build"].map((name) => {
                const v = verifs.find((x) => x.check_name === name);
                const st = v?.status ?? "skipped";
                return (
                  <button key={name} onClick={() => onViewOutput(name)} className={`rounded px-2 py-1 flex items-center justify-between focus-visible:ring-2 focus-visible:ring-signal/40 ${st === "passed" ? "bg-success/10" : st === "failed" ? "bg-gap/10" : "bg-raised"}`}>
                    <span className="text-xs capitalize text-text">{name}</span>
                    <span className={`text-[10px] font-mono uppercase ${st === "passed" ? "text-success" : st === "failed" ? "text-gap" : "text-muted"}`}>{st}{v ? ` ${v.duration_ms}ms` : ""}</span>
                  </button>
                );
              })}
            </div>
            {!allPassed && graded.length > 0 && (
              <button onClick={() => onViewOutput(verifs.find((v) => v.status === "failed")?.check_name || "tests")} className="text-[11px] text-gap hover:underline mt-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 rounded">View full output →</button>
            )}
          </div>

          <div>
            <p className="text-[11px] font-mono uppercase tracking-wide text-muted mb-1.5">Files changed</p>
            {(run.changed_files ?? []).length === 0 ? (
              <div className="flex flex-col items-center text-center py-4 text-muted">
                <GitBranchIcon size={20} className="mb-1.5" />
                <p className="text-xs">No changes yet.</p>
              </div>
            ) : (
              (run.changed_files ?? []).map((f) => (
                <button key={f.id} onClick={() => onOpenFile(f.path)} className="flex items-center gap-2 w-full text-left py-0.5 focus-visible:ring-2 focus-visible:ring-signal/40 rounded">
                  <span className="font-mono text-xs text-signal hover:underline truncate">{f.path}</span>
                  <span className="text-[10px] font-mono text-success">+{f.additions}</span>
                  <span className="text-[10px] font-mono text-gap">-{f.deletions}</span>
                </button>
              ))
            )}
          </div>

          {cr.status === "awaiting_review" && (
            <div className="space-y-2 pt-1">
              {!allPassed && <p className="text-[11px] text-gap flex items-center gap-1"><TriangleAlert size={12} /> Some checks failed — review the terminal before merging.</p>}
              {!confirmMerge ? (
                <Button variant="primary" className="w-full" onClick={() => setConfirmMerge(true)} disabled={busy}><GitMerge size={14} /> Merge to main</Button>
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
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => onReview("revision_requested")} disabled={busy}><RotateCcw size={13} /> Revise</Button>
                <Button variant="danger" size="sm" className="flex-1" onClick={() => onReview("discarded")} disabled={busy}><Trash2 size={13} /> Discard</Button>
              </div>
            </div>
          )}

          {cr.status === "merged" && (
            <div className="space-y-2">
              <p className="text-sm text-success flex items-center gap-1.5"><GitMerge size={15} /> Merged into main. Changes are live.</p>
              <Button variant="secondary" size="sm" className="w-full" onClick={onBack}><ArrowLeft size={13} /> Back to workspace</Button>
            </div>
          )}
          {cr.status === "revision_requested" && (
            <div className="space-y-2">
              <Button variant="primary" size="sm" className="w-full" onClick={onExecute} disabled={busy}>Re-run agent</Button>
              <Button variant="ghost" size="sm" className="w-full" onClick={onBack}>Back to workspace</Button>
            </div>
          )}
          {cr.status === "discarded" && (
            <div className="space-y-2">
              <p className="text-sm text-secondary flex items-center gap-1.5"><Trash2 size={14} /> Branch discarded. Main untouched.</p>
              <Button variant="secondary" size="sm" className="w-full" onClick={onBack}><ArrowLeft size={13} /> Back to workspace</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const CHECK_ORDER = ["tests", "lint", "typecheck", "build"];

function Terminal({
  open, onToggle, run, status, focusCheck, onFocusHandled,
}: {
  open: boolean; onToggle: () => void; run: BuildRun | null; status?: string;
  focusCheck: string | null; onFocusHandled: () => void;
}) {
  const verifs = run ? [...run.verifications].sort((a, b) => CHECK_ORDER.indexOf(a.check_name) - CHECK_ORDER.indexOf(b.check_name)) : [];
  const graded = verifs.filter((v) => v.status !== "skipped");
  const passed = graded.filter((v) => v.status === "passed").length;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // default: expand failed checks
  useEffect(() => {
    const failed = verifs.filter((v) => v.status === "failed").map((v) => v.check_name);
    if (failed.length) setExpanded((prev) => new Set([...prev, ...failed]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id]);

  // react to "View full output"
  useEffect(() => {
    if (!focusCheck) return;
    setExpanded((prev) => new Set([...prev, focusCheck]));
    const el = rowRefs.current[focusCheck];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    onFocusHandled();
  }, [focusCheck, onFocusHandled]);

  function toggle(name: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  }

  // Approximate per-step timestamps from the run start + cumulative real durations.
  const startMs = run?.started_at ? new Date(run.started_at).getTime() : Date.now();
  let cum = 0;
  const stamped = verifs.map((v) => {
    const ts = new Date(startMs + cum);
    cum += v.duration_ms;
    return { v, ts };
  });
  const fmt = (d: Date) => d.toTimeString().slice(0, 8);

  return (
    <div className={`border-t border-border shrink-0 flex flex-col ${open ? "h-56" : "h-9"}`}>
      <button onClick={onToggle} className="h-9 shrink-0 px-3 flex items-center gap-2 text-[11px] font-mono uppercase tracking-wide text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal/40">
        <TerminalIcon size={13} /> Terminal
        {status === "executing" && <Loader2 size={12} className="animate-spin text-signal" />}
        {graded.length > 0 && (
          <span className={`ml-2 ${passed === graded.length ? "text-success" : "text-gap"}`}>
            {passed === graded.length ? "All checks passed ✓" : `${passed}/${graded.length} passed`}
          </span>
        )}
        <span className="ml-auto">{open ? <ChevronDown size={13} /> : <ChevronUp size={13} />}</span>
      </button>
      {open && (
        <div className="flex-1 overflow-y-auto bg-[#15151c] text-[#d6d6dd] text-[11px]" style={{ fontFamily: MONO_STACK }}>
          {verifs.length === 0 ? (
            status === "executing" ? (
              <TerminalSkeleton />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-[#7a7a85] gap-2 py-6">
                <CheckCircle2 size={22} className="text-[#4fd18b]/60" />
                <p>Run verification to see results.</p>
              </div>
            )
          ) : (
            stamped.map(({ v, ts }, idx) => {
              const isOpen = expanded.has(v.check_name);
              const color = v.status === "passed" ? "text-[#4fd18b]" : v.status === "failed" ? "text-[#ff6b6b]" : "text-[#7a7a85]";
              const lines = (v.output || "(no output)").split("\n");
              return (
                <div key={v.id} ref={(el) => { rowRefs.current[v.check_name] = el; }} className={`border-b border-[#26262e] ${idx % 2 === 1 ? "bg-white/[0.02]" : ""}`}>
                  <button onClick={() => toggle(v.check_name)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#1c1c25] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal/40">
                    {isOpen ? <ChevronDown size={12} className="text-[#7a7a85]" /> : <ChevronRight size={12} className="text-[#7a7a85]" />}
                    <span className="text-[#6b6b78]">{fmt(ts)}</span>
                    <span className="text-[#5b8cff]">$</span>
                    <span className="text-[#e6e6ea]">{v.command || v.check_name}</span>
                    <span className={`ml-auto ${color}`}>[{v.status}]</span>
                    <span className="text-[#7a7a85]">{v.duration_ms}ms</span>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-2">
                      {lines.map((ln, i) => (
                        <div key={i} className="flex gap-3">
                          <span className="text-[#3a3a44] select-none w-7 text-right shrink-0">{i + 1}</span>
                          <span className="whitespace-pre-wrap text-[#b8b8c2] flex-1">{ln || " "}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function Landing({ busy, onConnect, error, onRetry }: { busy: boolean; onConnect: () => void; error: unknown; onRetry: () => void }) {
  const CARDS = [
    { title: "Scoped changes", body: "Plans before edits. The agent only touches files you approve — no freeform rewrites." },
    { title: "Protected paths", body: "Auth, billing, APIs, and secrets are blocked deterministically. Some things the AI can never touch." },
    { title: "Real verification", body: "Every change is backed by real test, lint, typecheck & build results — never a synthesized pass." },
  ];
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg px-6 py-12">
      <div className="max-w-3xl w-full text-center">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wide text-signal bg-signalLight/50 border border-signal/20 rounded-full px-3 py-1 mb-6">
          <Sparkles size={12} /> CareerStack Build IDE
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-text tracking-tight">AI writes code. Trust makes it ship.</h1>
        <p className="text-sm sm:text-base text-secondary mt-3 max-w-xl mx-auto">
          A personal AI coding environment with a safety layer: scoped change plans, deterministic protected-path
          blocking, branch isolation, and real verification behind every change.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8 text-left">
          {CARDS.map((c) => (
            <div key={c.title} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-center gap-1.5 mb-1.5">
                <ShieldCheck size={15} className="text-signal" />
                <p className="text-sm font-semibold text-text">{c.title}</p>
              </div>
              <p className="text-xs text-secondary leading-relaxed">{c.body}</p>
            </div>
          ))}
        </div>

        {error != null && (
          <div className="mt-6 w-full max-w-md mx-auto text-left">
            <ErrorPanel error={error as Error} title="Couldn’t load the workspace" />
            <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}><RefreshCw size={12} /> Retry</Button>
          </div>
        )}

        <div className="mt-8 flex flex-col items-center gap-2">
          <FolderGit2 size={26} className="text-signal/70" aria-hidden />
          <p className="text-sm text-secondary">Connect a repository to begin.</p>
          <Button variant="primary" onClick={onConnect} disabled={busy} className="mt-1">
            {busy ? <><Loader2 size={14} className="animate-spin" /> Provisioning…</> : "Connect local demo repository"}
          </Button>
          <p className="text-xs text-muted">GitHub write access isn’t configured — branch, PR &amp; merge run in labeled simulation.</p>
        </div>
      </div>
    </div>
  );
}
