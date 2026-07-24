"use client";

import { motion } from "framer-motion";
import { X, Keyboard } from "lucide-react";

type Shortcut = { keys: string[]; label: string };
const GROUPS: { category: string; items: Shortcut[] }[] = [
  {
    category: "Navigation",
    items: [
      { keys: ["⌘/Ctrl", "B"], label: "Toggle file tree" },
      { keys: ["⌘/Ctrl", "D"], label: "Open diff (when a changed file is selected)" },
    ],
  },
  {
    category: "Editor",
    items: [{ keys: ["⌘/Ctrl", "Enter"], label: "Submit command / generate plan" }],
  },
  {
    category: "Terminal",
    items: [{ keys: ["⌘/Ctrl", "T"], label: "Toggle terminal" }],
  },
  {
    category: "General",
    items: [
      { keys: ["Esc"], label: "Close modals / dismiss toasts" },
      { keys: ["?"], label: "Show this help" },
    ],
  },
];

function Keycap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[26px] px-2 py-1 text-[11px] font-mono text-text border border-border rounded-md bg-raised shadow-[0_1px_0_rgba(24,24,24,0.08)] whitespace-nowrap">
      {children}
    </kbd>
  );
}

export default function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.16 }}
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text flex items-center gap-2">
            <Keyboard size={16} className="text-signal" /> Keyboard shortcuts
          </h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 rounded p-0.5"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          {GROUPS.map((g) => (
            <div key={g.category}>
              <p className="text-[11px] font-mono uppercase tracking-wide text-muted mb-1.5">{g.category}</p>
              <div className="space-y-1.5">
                {g.items.map((s) => (
                  <div key={s.label} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-secondary">{s.label}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      {s.keys.map((k, i) => (
                        <span key={k} className="flex items-center gap-1">
                          {i > 0 && <span className="text-[10px] text-muted">+</span>}
                          <Keycap>{k}</Keycap>
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
