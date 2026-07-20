"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LoggedRequest, subscribeToRequestLog } from "@/lib/apiError";

export default function DebugDrawer() {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<LoggedRequest[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => subscribeToRequestLog(setLog), []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const failedCount = log.filter((r) => r.status === "network-error" || (typeof r.status === "number" && r.status >= 400)).length;

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-secondary shadow-lg hover:border-signal/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/30"
        title="Debug drawer (⌘.)"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${failedCount > 0 ? "bg-gap" : "bg-signal"}`} />
        Debug
        {failedCount > 0 && <span className="text-gap">({failedCount})</span>}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed bottom-0 left-0 right-0 z-50 h-80 bg-surface border-t border-border shadow-2xl flex"
          >
            <div className="w-72 shrink-0 border-r border-border overflow-y-auto">
              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                <p className="text-xs font-semibold text-text">Requests</p>
                <button onClick={() => setOpen(false)} className="text-muted hover:text-secondary text-xs">
                  ✕
                </button>
              </div>
              {log.length === 0 && <p className="px-3 py-3 text-xs text-muted">No requests yet.</p>}
              {log.map((r) => {
                const failed = r.status === "network-error" || (typeof r.status === "number" && r.status >= 400);
                return (
                  <button
                    key={r.id}
                    onClick={() => setExpanded(r.id)}
                    className={`w-full text-left px-3 py-2 border-b border-border/60 hover:bg-raised/60 ${
                      expanded === r.id ? "bg-raised" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-muted">{r.method}</span>
                      <span className={`text-[11px] font-mono ${failed ? "text-gap" : "text-signal"}`}>{r.status}</span>
                    </div>
                    <p className="text-xs text-text truncate mt-0.5">{r.endpoint}</p>
                    <p className="text-[10px] text-muted mt-0.5">{Math.round(r.durationMs)}ms</p>
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {!expanded && <p className="text-sm text-muted">Select a request to see its detail.</p>}
              {expanded &&
                (() => {
                  const r = log.find((x) => x.id === expanded);
                  if (!r) return null;
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-sm">
                        <span className="font-mono text-text">{r.method}</span>
                        <span className="text-secondary">{r.endpoint}</span>
                        <span className="text-muted">·</span>
                        <span className="text-muted">{r.status}</span>
                        <span className="text-muted">·</span>
                        <span className="text-muted">{Math.round(r.durationMs)}ms</span>
                        {r.provider && (
                          <>
                            <span className="text-muted">·</span>
                            <span className="text-signal">via {r.provider}</span>
                          </>
                        )}
                      </div>
                      {r.requestBody && (
                        <div>
                          <p className="text-[11px] font-mono font-medium text-muted uppercase tracking-wide mb-1">Request body</p>
                          <pre className="text-[11px] font-mono text-secondary bg-raised border border-border rounded-md p-2.5 whitespace-pre-wrap max-h-32 overflow-y-auto">
                            {r.requestBody}
                          </pre>
                        </div>
                      )}
                      {r.responseBody && (
                        <div>
                          <p className="text-[11px] font-mono font-medium text-muted uppercase tracking-wide mb-1">Response body</p>
                          <pre className="text-[11px] font-mono text-secondary bg-raised border border-border rounded-md p-2.5 whitespace-pre-wrap max-h-40 overflow-y-auto">
                            {r.responseBody}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
