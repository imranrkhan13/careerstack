"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import StepShell from "./StepShell";
import { api, GitHubImportResult } from "@/lib/api";
import ErrorPanel from "@/components/ui/ErrorPanel";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function GitHubStep({
  onContinue,
}: {
  onContinue: (result: GitHubImportResult | null) => void;
}) {
  const [username, setUsername] = useState("");
  const [result, setResult] = useState<GitHubImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const [narrativeStep, setNarrativeStep] = useState(0);

  async function fetchRepos() {
    setLoading(true);
    setError(null);
    setResult(null);
    setNarrativeStep(0);
    try {
      const r = await api.importGithub(username.trim());
      setResult(r);
      const lines = narrativeLines(r);
      for (let i = 0; i < lines.length; i++) {
        await new Promise((res) => setTimeout(res, 420));
        setNarrativeStep((n) => n + 1);
      }
    } catch (e: any) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  const lines = result ? narrativeLines(result) : [];

  return (
    <StepShell
      eyebrow="03 · portfolio"
      title="Show us your work."
      subtitle="Your public repos, read the way a hiring manager actually would."
      footer={
        <div className="flex items-center gap-4">
          <Button variant="primary" onClick={() => onContinue(result)}>
            Continue
          </Button>
          <button onClick={() => onContinue(null)} className="text-sm text-muted hover:text-secondary">
            Skip
          </button>
        </div>
      }
    >
      <div className="flex gap-2">
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="github username"
          className="flex-1"
          onKeyDown={(e) => e.key === "Enter" && fetchRepos()}
        />
        <Button variant="secondary" onClick={fetchRepos} disabled={loading || !username.trim()}>
          {loading ? "Scanning…" : "Import"}
        </Button>
      </div>

      {error && (
        <div className="mt-3">
          <ErrorPanel error={error} title="GitHub Analysis Failed" />
        </div>
      )}

      {result && (
        <div className="mt-5 rounded-lg border border-border bg-raised p-4">
          <AnimatePresence>
            {lines.slice(0, narrativeStep).map((line, i) => (
              <motion.p
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
                className="text-sm text-secondary mb-1.5 last:mb-0"
              >
                {line}
              </motion.p>
            ))}
          </AnimatePresence>

          {narrativeStep >= lines.length && (
            <motion.ul
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="mt-4 space-y-2"
            >
              {result.repos.map((r) => (
                <li key={r.name} className="rounded-lg border border-border bg-bg px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text">{r.name}</span>
                    <span className="text-xs font-mono text-muted">
                      {r.language ?? "—"} · {r.stars}★
                    </span>
                  </div>
                  {r.description && <p className="text-xs text-secondary mt-1">{r.description}</p>}
                </li>
              ))}
            </motion.ul>
          )}
        </div>
      )}
    </StepShell>
  );
}

function narrativeLines(r: GitHubImportResult): string[] {
  const lines: string[] = [];
  lines.push(`We found ${r.total_found} repositories.`);
  if (r.forks_excluded > 0) {
    lines.push(`We ignored ${r.forks_excluded} because they're forks — not your original work.`);
  }
  lines.push(`We think these ${r.shown_count} represent you best, ranked by real stars and how recently you touched them.`);
  if (r.dominant_language) {
    lines.push(`Your strongest stack looks like ${r.dominant_language}.`);
  }
  if (r.missing_description.length > 0) {
    lines.push(`${r.missing_description.length} of them have no description — worth writing one.`);
  }
  return lines;
}
