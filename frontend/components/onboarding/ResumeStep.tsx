"use client";
import ErrorPanel from "@/components/ui/ErrorPanel";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import StepShell from "./StepShell";
import { api, ParsedEntities } from "@/lib/api";

type RevealStage = "years" | "roles" | "projects" | "skills" | null;

const STAGE_LABEL: Record<Exclude<RevealStage, null>, string> = {
  years: "Experience found",
  roles: "Roles found",
  projects: "Projects found",
  skills: "Skills found",
};

export default function ResumeStep({
  onContinue,
}: {
  onContinue: (data: ParsedEntities | null) => void;
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ParsedEntities | null>(null);
  const [revealed, setRevealed] = useState<RevealStage[]>([]);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<any>(null);

  async function analyze() {
    setReading(true);
    setError(null);
    setResult(null);
    setRevealed([]);
    try {
      const parsed = await api.parseResume(text);
      // Reveal sections one at a time, in the order a person would want confirmation —
      // this is a choreographed reveal of the real result, not fabricated content.
      const stages: Exclude<RevealStage, null>[] = ["years", "roles", "projects", "skills"];
      const applicable = stages.filter((s) => {
        if (s === "years") return parsed.years_experience != null;
        if (s === "roles") return parsed.roles.length > 0;
        if (s === "projects") return parsed.projects.length > 0;
        if (s === "skills") return parsed.skills.length > 0;
        return false;
      });
      setResult(parsed);
      for (let i = 0; i < applicable.length; i++) {
        await new Promise((r) => setTimeout(r, 380));
        setRevealed((prev) => [...prev, applicable[i]]);
      }
    } catch (e: any) {
      setError(e);
    } finally {
      setReading(false);
    }
  }

  return (
    <StepShell
      eyebrow="02 · resume"
      title="Paste your resume."
      subtitle="Plain text is fine. We read what's actually there — nothing is invented."
      footer={
        <div className="flex items-center gap-4">
          <button
            onClick={() => onContinue(result)}
            className="px-4 py-2 rounded-lg bg-signal text-white text-sm font-medium"
          >
            Continue
          </button>
          <button onClick={() => onContinue(null)} className="text-sm text-muted hover:text-secondary">
            Skip
          </button>
        </div>
      }
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder="Paste your resume text here…"
        className="w-full rounded-lg border border-border bg-raised px-4 py-3 text-sm outline-none focus:border-signal/50 placeholder:text-muted resize-none"
      />

      <button
        onClick={analyze}
        disabled={reading || !text.trim()}
        className="mt-3 px-3.5 py-2 rounded-lg border border-border text-sm hover:border-secondary/40 disabled:opacity-40"
      >
        {reading ? "Reading…" : "Analyze"}
      </button>

      {error && (
        <div className="mt-3"><ErrorPanel error={error} /></div>
      )}

      {result && (
        <div className="mt-5 rounded-lg border border-border bg-raised p-4 min-h-[80px]">
          <AnimatePresence>
            {revealed.includes("years") && (
              <RevealLine label={STAGE_LABEL.years}>
                <span className="text-signal">{result.years_experience} years</span> of experience
              </RevealLine>
            )}
            {revealed.includes("roles") && (
              <RevealLine label={STAGE_LABEL.roles}>
                {result.roles.map((r, i) => (
                  <span key={i} className="block text-secondary">
                    {r.title} · {r.company}
                  </span>
                ))}
              </RevealLine>
            )}
            {revealed.includes("projects") && (
              <RevealLine label={STAGE_LABEL.projects}>
                <span className="text-secondary">{result.projects.length} project{result.projects.length !== 1 ? "s" : ""} identified</span>
              </RevealLine>
            )}
            {revealed.includes("skills") && (
              <RevealLine label={STAGE_LABEL.skills}>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {result.skills.map((s) => (
                    <span key={s} className="text-xs font-mono px-2 py-1 rounded-md bg-signal/10 text-signal">
                      {s}
                    </span>
                  ))}
                </div>
              </RevealLine>
            )}
          </AnimatePresence>
        </div>
      )}
    </StepShell>
  );
}

function RevealLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35 }}
      className="mb-3 last:mb-0"
    >
      <p className="text-[11px] font-mono text-muted uppercase tracking-wide mb-1">{label}</p>
      <div className="text-sm text-text">{children}</div>
    </motion.div>
  );
}
