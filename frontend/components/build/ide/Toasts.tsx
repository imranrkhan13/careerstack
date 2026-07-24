"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

export type ToastTone = "success" | "error" | "info";
export type ToastItem = { id: string; tone: ToastTone; message: string };

const TONE: Record<ToastTone, { cls: string; Icon: typeof Info }> = {
  success: { cls: "border-success/40 bg-success/10 text-success", Icon: CheckCircle2 },
  error: { cls: "border-gap/40 bg-gap/10 text-gap", Icon: XCircle },
  info: { cls: "border-signal/40 bg-signalLight text-signal", Icon: Info },
};

export default function Toasts({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed top-4 right-4 z-[70] flex flex-col gap-2 w-[320px] max-w-[calc(100vw-2rem)]" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => {
          const { cls, Icon } = TONE[t.tone];
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.18 }}
              className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 shadow-lg bg-surface ${cls}`}
              role="status"
            >
              <Icon size={16} className="shrink-0 mt-0.5" />
              <p className="text-xs text-text flex-1 leading-snug">{t.message}</p>
              <button onClick={() => onDismiss(t.id)} className="text-muted hover:text-text shrink-0" aria-label="Dismiss">
                <X size={13} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/** Small helper hook wiring auto-dismiss timers. */
export function useToastTimers(toasts: ToastItem[], dismiss: (id: string) => void, ms = 4500) {
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) => setTimeout(() => dismiss(t.id), ms));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss, ms]);
}
