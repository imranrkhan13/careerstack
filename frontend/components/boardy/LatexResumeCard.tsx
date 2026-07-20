"use client";

import { useState } from "react";
import { api, Recommendation } from "@/lib/api";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import ErrorPanel from "@/components/ui/ErrorPanel";

/**
 * When Boardy sends a full resume as LaTeX instead of bullet-level feedback,
 * this is the prompt: confirm before compiling, then a real download link —
 * not an auto-applied resume you didn't ask for.
 */
export default function LatexResumeCard({
  rec,
  onResolved,
}: {
  rec: Recommendation;
  onResolved: (updated: Recommendation) => void;
}) {
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState<any>(null);
  const [showSource, setShowSource] = useState(false);

  async function compile() {
    setCompiling(true);
    setError(null);
    try {
      await api.compileLatexResume(rec.id);
      onResolved({ ...rec, status: "compiled" });
    } catch (e: any) {
      setError(e);
    } finally {
      setCompiling(false);
    }
  }

  return (
    <Card className="py-3">
      <p className="text-sm font-medium text-text mb-1">📄 Boardy sent a full resume (LaTeX)</p>
      <p className="text-xs text-secondary mb-2">
        Do you want to turn this into a resume? This compiles it for real with pdflatex — nothing is
        pre-rendered or faked.
      </p>

      <button onClick={() => setShowSource((v) => !v)} className="text-xs text-signal hover:underline mb-2">
        {showSource ? "Hide" : "View"} LaTeX source
      </button>
      {showSource && (
        <pre className="text-[10px] font-mono text-secondary bg-raised border border-border rounded-md p-2.5 mb-2 max-h-48 overflow-y-auto whitespace-pre-wrap">
          {rec.latex_source}
        </pre>
      )}

      {error && <div className="mb-2"><ErrorPanel error={error} title="Couldn't compile this resume" /></div>}

      {rec.status === "compiled" ? (
        <a href={api.latexResumeDownloadUrl(rec.id)} download="resume.pdf">
          <Button variant="primary" size="sm">Download resume.pdf</Button>
        </a>
      ) : (
        <Button variant="primary" size="sm" onClick={compile} disabled={compiling}>
          {compiling ? "Compiling…" : "Turn this into a resume"}
        </Button>
      )}
    </Card>
  );
}
