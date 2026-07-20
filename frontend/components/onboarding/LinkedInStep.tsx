"use client";
import ErrorPanel from "@/components/ui/ErrorPanel";

import { useState } from "react";
import StepShell from "./StepShell";
import { api, ParsedEntities } from "@/lib/api";

export default function LinkedInStep({
  onContinue,
}: {
  onContinue: (data: ParsedEntities | null) => void;
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ParsedEntities | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      const parsed = await api.parseLinkedIn(text);
      setResult(parsed);
    } catch (e: any) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <StepShell
      eyebrow="04 · linkedin"
      title="Paste your LinkedIn 'About' section."
      subtitle="LinkedIn doesn't offer a public import API, so paste it here — we read it the same way."
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
        rows={6}
        placeholder="Paste your LinkedIn About / summary text…"
        className="w-full rounded-lg border border-border bg-raised px-4 py-3 text-sm outline-none focus:border-signal/50 placeholder:text-muted resize-none"
      />
      <button
        onClick={analyze}
        disabled={loading || !text.trim()}
        className="mt-3 px-3.5 py-2 rounded-lg border border-border text-sm hover:border-secondary/40 disabled:opacity-40"
      >
        {loading ? "Reading…" : "Analyze"}
      </button>

      {error && (
        <div className="mt-3"><ErrorPanel error={error} /></div>
      )}

      {result && (
        <div className="mt-5 rounded-lg border border-border bg-raised p-4">
          <p className="text-sm text-secondary">{result.summary}</p>
        </div>
      )}
    </StepShell>
  );
}
