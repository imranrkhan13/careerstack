"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "⌘/Ctrl + Enter", label: "Submit command / generate plan" },
  { keys: "⌘/Ctrl + B", label: "Toggle file tree" },
  { keys: "⌘/Ctrl + T", label: "Toggle terminal" },
  { keys: "⌘/Ctrl + D", label: "Open diff (when a changed file is selected)" },
  { keys: "Esc", label: "Close modals / dismiss toasts" },
  { keys: "?", label: "Show this help" },
];

export default function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
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
          <h2 className="text-base font-semibold text-text">Keyboard shortcuts</h2>
          <button onClick={onClose} className="text-muted hover:text-text focus-visible:ring-2 focus-visible:ring-signal/40 rounded" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between gap-4">
              <span className="text-sm text-secondary">{s.label}</span>
              <kbd className="text-[11px] font-mono text-text border border-border rounded px-2 py-1 bg-raised whitespace-nowrap">{s.keys}</kbd>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
