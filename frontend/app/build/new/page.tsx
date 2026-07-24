"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buildApi, BuildRepo } from "@/lib/api";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Input";
import ErrorPanel from "@/components/ui/ErrorPanel";
import BuildShell, { SectionTitle } from "@/components/build/BuildShell";

const RISKS: { key: string; label: string; hint: string }[] = [
  { key: "low", label: "Low", hint: "Copy, styling, isolated UI" },
  { key: "medium", label: "Medium", hint: "New component or logic" },
  { key: "high", label: "High", hint: "Cross-cutting or data flow" },
];

export default function NewChangeRequestPage() {
  const router = useRouter();
  const [repo, setRepo] = useState<BuildRepo | null>(null);
  const [requestText, setRequestText] = useState("");
  const [constraints, setConstraints] = useState("");
  const [acceptance, setAcceptance] = useState("");
  const [risk, setRisk] = useState("low");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    buildApi.listRepos().then((r) => setRepo(r[0] ?? null)).catch(setError);
  }, []);

  async function submit() {
    if (!repo || !requestText.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const cr = await buildApi.createChangeRequest(repo.id, {
        request_text: requestText.trim(),
        constraints_text: constraints.trim() || undefined,
        acceptance_criteria_text: acceptance.trim() || undefined,
        risk_level: risk,
      });
      router.push(`/build/requests/${cr.id}`);
    } catch (e) {
      setError(e);
      setSubmitting(false);
    }
  }

  return (
    <BuildShell>
      <Link href="/build" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text mb-4">
        <ArrowLeft size={14} /> Back to workspace
      </Link>
      <h1 className="text-2xl font-bold text-text tracking-tight mb-1">New change request</h1>
      <p className="text-sm text-secondary mb-6">
        Describe what you want in plain English. The agent will produce a plan first — no code is touched
        until you approve the scope.
      </p>

      {error != null && (
        <div className="mb-4">
          <ErrorPanel error={error as Error} title="Could not create request" />
        </div>
      )}

      <Card className="space-y-5">
        <div>
          <SectionTitle>Your request</SectionTitle>
          <Textarea
            value={requestText}
            onChange={(e) => setRequestText(e.target.value)}
            rows={4}
            placeholder="e.g. Make a polished landing page hero with a stronger headline — but do not change auth, billing, APIs, or the database."
          />
        </div>
        <div>
          <SectionTitle>Constraints — “Do not change…” (optional)</SectionTitle>
          <Textarea
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            rows={2}
            placeholder="e.g. Do not change app/api, auth, billing, or the database schema."
          />
        </div>
        <div>
          <SectionTitle>Acceptance criteria (optional)</SectionTitle>
          <Textarea
            value={acceptance}
            onChange={(e) => setAcceptance(e.target.value)}
            rows={2}
            placeholder="e.g. The hero still renders and all tests + build pass."
          />
        </div>
        <div>
          <SectionTitle>Risk level</SectionTitle>
          <div className="flex gap-2">
            {RISKS.map((r) => (
              <button
                key={r.key}
                onClick={() => setRisk(r.key)}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  risk === r.key ? "border-signal/60 bg-signalLight/40" : "border-border hover:border-signal/30"
                }`}
              >
                <p className="text-sm font-medium text-text">{r.label}</p>
                <p className="text-[11px] text-muted mt-0.5">{r.hint}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button variant="ghost" onClick={() => router.push("/build")}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={submitting || !requestText.trim() || !repo}>
            {submitting ? "Creating…" : "Create change brief"}
          </Button>
        </div>
      </Card>
    </BuildShell>
  );
}
