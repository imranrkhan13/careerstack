type Tone = "signal" | "gap" | "neutral" | "success";

const TONE_CLASSES: Record<Tone, string> = {
  signal: "bg-signalLight text-signal",
  gap: "bg-gap/10 text-gap",
  success: "bg-success/10 text-success",
  neutral: "bg-raised text-muted border border-border",
};

/** Small category/status chip — used for category badges, stale/follow-up flags, and status pills. */
export default function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center text-[11px] font-medium font-mono uppercase tracking-wide px-1.5 py-0.5 rounded ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}
