"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, JobStatus, ApplicationRecord } from "@/lib/api";
import { ApiError } from "@/lib/apiError";
import ErrorPanel from "@/components/ui/ErrorPanel";
import Button from "@/components/ui/Button";
import LinkedText from "@/components/ui/LinkedText";
import { Textarea } from "@/components/ui/Input";

export default function NewFromJDFlow({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (app: ApplicationRecord) => void;
}) {
  const [jdText, setJdText] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function start() {
    setError(null);
    try {
      const { job_id } = await api.applicationFromJD(jdText);
      setJobId(job_id);
    } catch (e: any) {
      setError(e);
    }
  }

  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const s = await api.getJob(jobId);
        setStatus(s);
        if (s.status === "done" || s.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
          if (s.status === "done" && s.result) {
            const apps = await api.listApplications();
            const created = apps.find((a) => a.id === s.result!.application_id);
            if (created) onCreated(created);
          }
        }
      } catch (e: any) {
        setError(e);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId]);

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center px-6" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg rounded-xl border border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {!jobId && (
          <>
            <h2 className="text-sm font-semibold text-text mb-1">Paste a job description</h2>
            <p className="text-xs text-muted mb-3">
              Careerstack will match it against what it already knows about you, create the
              application, and draft outreach — one flow, no separate steps to run yourself.
            </p>
            <Textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              rows={8}
              placeholder="Paste the full job description…"
            />
            {error && (
              <div className="mt-2">
                <ErrorPanel error={error} />
              </div>
            )}
            <div className="flex gap-2 mt-3">
              <Button variant="primary" onClick={start} disabled={!jdText.trim()}>
                Go
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </>
        )}

        {jobId && status && status.status !== "done" && status.status !== "error" && (
          <div>
            <h2 className="text-sm font-semibold text-text mb-4">Working on it…</h2>
            <ul className="space-y-2.5">
              {status.steps.map((step, i) => (
                <li key={i} className="flex items-center gap-2.5 text-sm">
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                      step.done ? "bg-signal text-white" : "bg-raised border border-border text-muted"
                    }`}
                  >
                    {step.done ? "✓" : ""}
                  </span>
                  <span className={step.done ? "text-text" : "text-muted"}>{step.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {status?.status === "error" && status.error && (
          <div>
            <h2 className="text-sm font-semibold text-text mb-3">Application Creation Failed</h2>
            <ErrorPanel
              error={
                new ApiError({
                  kind: "api",
                  endpoint: "POST /applications/from-jd",
                  method: "POST",
                  message: status.error.message,
                  structured: status.error,
                })
              }
            />
            <Button variant="secondary" className="mt-3" onClick={onClose}>
              Close
            </Button>
          </div>
        )}

        <AnimatePresence>
          {status?.status === "done" && status.result && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <h2 className="text-sm font-semibold text-text mb-1">
                {status.result.role} @ {status.result.company}
              </h2>
              <p className="text-2xl font-mono text-signal mb-2">
                {Math.round(status.result.match_score * 100)}% match
              </p>
              {status.result.matched_skills.length > 0 && (
                <p className="text-xs text-secondary mb-3">
                  Matched on: {status.result.matched_skills.join(", ")}
                </p>
              )}
              {status.result.boardy_draft && (
                <div className="rounded-lg border border-border bg-raised p-3 mb-3">
                  <p className="text-[11px] font-mono font-medium text-muted uppercase tracking-wide mb-1.5">
                    Draft outreach
                  </p>
                  <p className="text-xs text-secondary whitespace-pre-wrap"><LinkedText text={status.result.boardy_draft} /></p>
                </div>
              )}
              {status.result.boardy_draft_error && (
                <p className="text-xs text-gap mb-3">
                  Outreach draft skipped: {status.result.boardy_draft_error}
                </p>
              )}
              <Button variant="primary" onClick={onClose}>
                Added to your board
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
