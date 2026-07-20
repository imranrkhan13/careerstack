"use client";

import { useEffect, useState } from "react";
import { api, GraphNode, TodayItem } from "@/lib/api";
import Badge from "@/components/ui/Badge";
import LinkedText from "@/components/ui/LinkedText";
import Button from "@/components/ui/Button";

const SENDER_LABEL: Record<string, string> = {
  resume_update: "Resume Agent",
  boardy_reply: "Boardy",
  job_match: "Jobs Agent",
  interview: "Interview",
  github: "Portfolio Agent",
  practice: "Practice",
  gap: "Graph Agent",
  portfolio: "Portfolio Agent",
  history: "History",
  update: "Careerstack",
};

export default function ContextPanel({
  item,
  onAction,
}: {
  item: TodayItem | null;
  onAction?: (item: TodayItem) => void;
}) {
  const [node, setNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!item?.node_id) {
      setNode(null);
      return;
    }
    setLoading(true);
    api
      .getNode(item.node_id)
      .then(setNode)
      .catch(() => setNode(null))
      .finally(() => setLoading(false));
  }, [item?.node_id]);

  return (
    <aside className="hidden xl:flex xl:flex-col w-96 shrink-0 border-l border-border bg-surface h-screen sticky top-0 overflow-y-auto">
      {!item && (
        <div className="px-6 py-5">
          <p className="text-sm text-muted">
            Select an item from Today to see its detail here — reasoning, evidence,
            and where it came from.
          </p>
        </div>
      )}

      {item && (
        <div className="flex flex-col h-full">
          {/* Header: sender + date */}
          <div className="px-6 py-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-text">{SENDER_LABEL[item.kind] ?? "Careerstack"}</span>
              {item.created_at && (
                <span className="text-xs text-muted">{new Date(item.created_at).toLocaleString()}</span>
              )}
            </div>
            <h2 className="text-sm text-secondary">{item.title}</h2>
          </div>

          <div className="border-t border-border" />

          {/* Body */}
          <div className="px-6 py-5 flex-1">
            {item.detail && <p className="text-sm text-text leading-relaxed mb-4"><LinkedText text={item.detail} /></p>}
            {item.reasoning && (
              <div className="mb-4">
                <p className="text-[11px] font-mono font-medium text-muted uppercase tracking-wide mb-1.5">Reasoning</p>
                <p className="text-sm text-secondary leading-relaxed"><LinkedText text={item.reasoning} /></p>
              </div>
            )}

            {loading && <p className="text-xs text-muted">Loading…</p>}

            {node && Object.keys(node.data).length > 0 && (
              <div>
                <p className="text-[11px] font-mono font-medium text-muted uppercase tracking-wide mb-1.5">What we know</p>
                <div className="space-y-1.5 bg-raised rounded-lg p-3 border border-border">
                  {Object.entries(node.data)
                    .filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0))
                    .map(([key, value]) => (
                      <div key={key} className="text-xs">
                        <span className="text-muted">{formatKey(key)}: </span>
                        <span className="text-secondary">{formatValue(value)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border" />

          {/* Metadata chips + actions */}
          <div className="px-6 py-4">
            <div className="flex flex-wrap items-center gap-1.5 mb-4">
              <Badge tone={item.kind === "gap" ? "gap" : "signal"}>{item.kind.replace(/_/g, " ")}</Badge>
              {item.confidence != null && <Badge tone="neutral">{Math.round(item.confidence * 100)}% confidence</Badge>}
              {node && <Badge tone="neutral">{node.type.replace(/_/g, " ")}</Badge>}
            </div>
            <Button variant="primary" size="md" className="w-full" onClick={() => item && onAction?.(item)}>
              {item.action}
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}

function formatKey(key: string): string {
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ");
  if (typeof value === "object" && value !== null) return Object.values(value).join(" ");
  return String(value);
}
