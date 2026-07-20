"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { api, ApplicationRecord, BoardyThread } from "@/lib/api";

type Command = { label: string; hint?: string; group: string; action: () => void };

/**
 * Cmd+K is the primary navigation surface now: every static route, plus real
 * applications and Boardy threads fetched fresh each time the palette opens —
 * not a hardcoded list. Arrow keys + Enter navigate it like Raycast/Linear.
 */
export default function CommandBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [threads, setThreads] = useState<BoardyThread[]>([]);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlighted(0);
    api.listApplications().then(setApplications).catch(() => setApplications([]));
    api.boardyThreads().then(setThreads).catch(() => setThreads([]));
  }, [open]);

  const staticCommands: Command[] = [
    { label: "Go to Today", hint: "Inbox", group: "Navigate", action: () => router.push("/today") },
    { label: "Open Career Timeline", hint: "Activity feed", group: "Navigate", action: () => router.push("/timeline") },
    { label: "Open resume editor", hint: "Cursor-style editor", group: "Navigate", action: () => router.push("/resume") },
    { label: "Import resume", hint: "Onboarding", group: "Navigate", action: () => router.push("/onboarding") },
    { label: "Open Applications", hint: "Pipeline", group: "Navigate", action: () => router.push("/applications") },
    { label: "Open Boardy", hint: "Conversations", group: "Navigate", action: () => router.push("/boardy") },
    { label: "Open Settings", hint: "Gmail connection", group: "Navigate", action: () => router.push("/settings") },
  ];

  const applicationCommands: Command[] = applications.map((a) => ({
    label: `${a.role} @ ${a.company}`,
    hint: a.stage,
    group: "Applications",
    action: () => router.push("/applications"),
  }));

  const threadCommands: Command[] = threads.map((t) => ({
    label: t.subject,
    hint: t.status === "replied" ? "Replied" : "Awaiting reply",
    group: "Boardy",
    action: () => router.push("/boardy"),
  }));

  const all = [...staticCommands, ...applicationCommands, ...threadCommands];
  const filtered = all.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));

  function run(c: Command) {
    c.action();
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && filtered[highlighted]) {
      run(filtered[highlighted]);
    }
  }

  let lastGroup = "";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-32"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlighted(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search or jump to anything…"
              className="w-full bg-transparent px-4 py-3 text-sm outline-none border-b border-border placeholder:text-muted"
            />
            <ul className="max-h-96 overflow-y-auto py-1">
              {filtered.map((c, i) => {
                const showGroup = c.group !== lastGroup;
                lastGroup = c.group;
                return (
                  <div key={i}>
                    {showGroup && (
                      <p className="px-4 pt-2 pb-1 text-[11px] font-mono font-medium text-muted uppercase tracking-wide">
                        {c.group}
                      </p>
                    )}
                    <li
                      onMouseEnter={() => setHighlighted(i)}
                      onClick={() => run(c)}
                      className={`mx-1 px-3 py-2 rounded-md flex justify-between items-center cursor-pointer text-sm transition-colors duration-100 ${
                        highlighted === i ? "bg-raised text-text" : "text-secondary"
                      }`}
                    >
                      <span className="truncate">{c.label}</span>
                      {c.hint && <span className="text-xs text-muted shrink-0 ml-3">{c.hint}</span>}
                    </li>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <li className="px-4 py-3 text-sm text-muted">No matches.</li>
              )}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
