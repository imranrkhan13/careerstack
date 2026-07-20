"use client";
import ErrorPanel from "@/components/ui/ErrorPanel";

import { useState } from "react";
import { api, Recommendation } from "@/lib/api";
import Card from "@/components/ui/Card";
import LinkedText from "@/components/ui/LinkedText";
import Button from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";

export default function RecommendationCard({
  rec,
  onResolved,
}: {
  rec: Recommendation;
  onResolved: (updated: Recommendation) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState(rec.suggested_text ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<any>(null);
  const [rechecked, setRechecked] = useState<number | null>(null);

  async function accept(useEdited: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await api.acceptRecommendation(rec.id, useEdited ? editedText : undefined);
      setRechecked(result.version.applications_rechecked);
      onResolved(result.recommendation);
    } catch (e: any) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.rejectRecommendation(rec.id);
      onResolved(updated);
    } catch (e: any) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  if (rec.status !== "pending") {
    return (
      <Card className="opacity-60 py-2.5">
        <p className="text-xs text-muted line-through">{rec.original_text}</p>
        <p className="text-xs text-secondary mt-1">
          {rec.status === "accepted" ? `Applied: ${rec.applied_text}` : "Rejected"}
        </p>
      </Card>
    );
  }

  return (
    <Card className="py-3">
      <p className="text-[11px] font-mono font-medium text-muted uppercase tracking-wide mb-1">
        {rec.matched_bullet_id ? `Matched with ${Math.round(rec.match_confidence * 100)}% confidence` : "No matching bullet found"}
      </p>
      <p className="text-xs text-muted line-through mb-1">{rec.original_text}</p>
      {!editing ? (
        <p className="text-sm text-text mb-2">{rec.suggested_text}</p>
      ) : (
        <Textarea value={editedText} onChange={(e) => setEditedText(e.target.value)} rows={2} className="mb-2" />
      )}
      <p className="text-xs text-secondary mb-2"><LinkedText text={rec.reasoning} /></p>

      {error && <div className="mb-2"><ErrorPanel error={error} /></div>}
      {rechecked != null && (
        <p className="text-xs text-signal mb-2">
          Applied. {rechecked} application{rechecked !== 1 ? "s" : ""} rechecked.
        </p>
      )}

      {rechecked == null && (
        <div className="flex gap-2">
          {!editing ? (
            <>
              <Button variant="primary" size="sm" onClick={() => accept(false)} disabled={busy || !rec.matched_bullet_id || !rec.suggested_text}>
                Accept
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)} disabled={busy}>
                Edit
              </Button>
              <Button variant="secondary" size="sm" onClick={reject} disabled={busy}>
                Reject
              </Button>
            </>
          ) : (
            <>
              <Button variant="primary" size="sm" onClick={() => accept(true)} disabled={busy || !editedText.trim()}>
                Accept edit
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
