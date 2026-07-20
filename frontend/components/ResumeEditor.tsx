"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ErrorPanel from "@/components/ui/ErrorPanel";
import Button from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import Skeleton from "@/components/ui/Skeleton";
import { api } from "@/lib/api";

type Diff = {
  original: string;
  suggestion: string;
  reasoning: string;
  confidence: number;
  sources: string[];
  range: Range;
  instructionLabel: string;
};

type Toast = { message: string; onUndo?: () => void };

const ACTIONS: { key: string; label: string }[] = [
  { key: "shorter", label: "Shorter" },
  { key: "more_technical", label: "More technical" },
  { key: "more_impact", label: "More impact" },
  { key: "quantify", label: "Quantify" },
  { key: "ats_friendly", label: "ATS friendly" },
  { key: "match_jd", label: "Match JD" },
  { key: "compare_previous", label: "Compare version" },
  { key: "explain", label: "Explain" },
  { key: "expand", label: "Expand" },
];

function contentToText(content: any): string {
  if (!content) return "";
  if (typeof content.text === "string") return content.text;
  if (Array.isArray(content.bullets)) return content.bullets.map((b: any) => b.text).join("\n");
  return "";
}

export default function ResumeEditor({ jobDescription }: { jobDescription?: string }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [pendingRange, setPendingRange] = useState<Range | null>(null);
  const [diff, setDiff] = useState<Diff | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<any>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [saving, setSaving] = useState(false);

  // Real persistence: load whatever was actually uploaded/saved last, instead of
  // always showing static placeholder text.
  const [loadingResume, setLoadingResume] = useState(true);
  const [resumeText, setResumeText] = useState<string | null>(null);
  const [uploadDraft, setUploadDraft] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api
      .getCurrentResume()
      .then((current) => setResumeText(current ? contentToText(current.content) : null))
      .catch((e) => setError(e))
      .finally(() => setLoadingResume(false));
  }, []);

  async function uploadResume() {
    if (!uploadDraft.trim()) return;
    setUploading(true);
    setError(null);
    try {
      await api.createResumeVersion({ text: uploadDraft }, "Initial upload", "manual");
      setResumeText(uploadDraft);
      setUploadDraft("");
    } catch (e: any) {
      setError(e);
    } finally {
      setUploading(false);
    }
  }

  const onMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setToolbarPos(null);
      return;
    }
    const text = sel.toString().trim();
    if (!text) {
      setToolbarPos(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setSelectedText(text);
    setPendingRange(range.cloneRange());
    setToolbarPos({ x: rect.left + rect.width / 2, y: rect.top - 12 + window.scrollY });
    setDiff(null);
    setError(null);
  }, []);

  async function runAction(instruction: string) {
    if (!pendingRange) return;
    setLoading(instruction);
    setError(null);
    try {
      const result = await api.rewriteBullet(selectedText, instruction, jobDescription);
      const label = ACTIONS.find((a) => a.key === instruction)?.label ?? instruction;
      setDiff({ ...result, range: pendingRange, instructionLabel: label });
    } catch (e: any) {
      setError(e);
    } finally {
      setLoading(null);
    }
  }

  async function acceptDiff() {
    if (!diff || !editorRef.current) return;
    const before = editorRef.current.innerHTML;

    diff.range.deleteContents();
    diff.range.insertNode(document.createTextNode(diff.suggestion));
    setDiff(null);
    setToolbarPos(null);

    setSaving(true);
    const fullText = editorRef.current.innerText;
    try {
      const version = await api.createResumeVersion(
        { text: fullText },
        `${diff.instructionLabel}: "${diff.original.slice(0, 40)}${diff.original.length > 40 ? "…" : ""}"`,
        "ai_edit"
      );
      setResumeText(fullText);
      const rechecked = version.applications_rechecked;
      setToast({
        message:
          rechecked > 0
            ? `Saved. ${rechecked} application${rechecked !== 1 ? "s" : ""} rechecked against your new resume.`
            : "Saved to your resume history.",
        onUndo: () => {
          if (editorRef.current) editorRef.current.innerHTML = before;
          setToast(null);
        },
      });
      setTimeout(() => setToast((t) => (t?.onUndo ? { message: t.message } : t)), 6000);
    } catch (e: any) {
      setToast({ message: `Edit applied, but saving the version failed: ${e.message}` });
    } finally {
      setSaving(false);
    }
  }

  function rejectDiff() {
    setDiff(null);
  }

  if (loadingResume) {
    return <Skeleton className="min-h-[500px] w-full rounded-xl" />;
  }

  if (resumeText === null) {
    return (
      <div className="rounded-xl border border-border bg-surface p-8 text-center">
        <p className="text-3xl mb-3">📄</p>
        <p className="text-sm font-medium text-text mb-1.5">Upload your resume once.</p>
        <p className="text-sm text-secondary mb-4">
          CareerOS remembers it from here on — this is a one-time upload, not something you paste
          again every visit.
        </p>
        <Textarea
          value={uploadDraft}
          onChange={(e) => setUploadDraft(e.target.value)}
          rows={10}
          placeholder="Paste your resume text…"
          className="text-left mb-3"
        />
        {error && <div className="mb-3"><ErrorPanel error={error} /></div>}
        <Button variant="primary" onClick={uploadResume} disabled={uploading || !uploadDraft.trim()}>
          {uploading ? "Saving…" : "Save resume"}
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onMouseUp={onMouseUp}
        className="min-h-[500px] rounded-xl border border-border bg-surface px-8 py-8 text-[15px] leading-relaxed outline-none focus:border-signal/50 whitespace-pre-wrap"
      >
        {resumeText}
      </div>

      {toolbarPos && !diff && (
        <div
          className="fixed z-40 -translate-x-1/2 -translate-y-full flex gap-1 rounded-lg border border-border bg-surface shadow-lg px-1.5 py-1.5"
          style={{ left: toolbarPos.x, top: toolbarPos.y }}
        >
          {ACTIONS.map((a) => (
            <button
              key={a.key}
              onClick={() => runAction(a.key)}
              disabled={loading !== null}
              className="px-2.5 py-1 text-xs text-text rounded-md hover:bg-raised disabled:opacity-40 whitespace-nowrap"
            >
              {loading === a.key ? "…" : a.label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-3">
          <ErrorPanel error={error} title="Rewrite Failed" />
        </div>
      )}

      {diff && (
        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <div className="text-xs uppercase tracking-wide text-muted mb-2">Suggested change</div>
          <p className="text-sm line-through text-muted mb-2">{diff.original}</p>
          <p className="text-sm text-text mb-3">{diff.suggestion}</p>
          <p className="text-xs text-muted mb-1">{diff.reasoning}</p>
          <p className="text-xs text-muted mb-4">
            Confidence {Math.round(diff.confidence * 100)}% · sources: {diff.sources.join(", ")}
          </p>
          <div className="flex gap-2">
            <button onClick={acceptDiff} className="px-3 py-1.5 text-xs rounded-md bg-signal text-white">
              Accept
            </button>
            <button onClick={rejectDiff} className="px-3 py-1.5 text-xs rounded-md border border-border">
              Reject
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2.5 shadow-lg">
          <span className="text-xs text-text">{saving ? "Saving…" : toast.message}</span>
          {toast.onUndo && (
            <button onClick={toast.onUndo} className="text-xs text-signal hover:underline">
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
